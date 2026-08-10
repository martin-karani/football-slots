use std::sync::Arc;

use base64::Engine;
use chrono::Utc;
use secrecy::ExposeSecret;
use uuid::Uuid;

use crate::config::Config;
use crate::domain::models::{
    errors::{DomainError, DomainResult},
    mpesa::{MpesaDirection, MpesaTransaction, TransactionStatus},
    wallet::{CurrencyType, LedgerEntryType},
};
use crate::ports::repositories::{MpesaRepository, UserRepository, WalletRepository};

pub struct MpesaServiceImpl {
    mpesa_repo: Arc<dyn MpesaRepository>,
    wallet_repo: Arc<dyn WalletRepository>,
    user_repo: Arc<dyn UserRepository>,
    config: Config,
}

impl MpesaServiceImpl {
    pub fn new(
        mpesa_repo: Arc<dyn MpesaRepository>,
        wallet_repo: Arc<dyn WalletRepository>,
        user_repo: Arc<dyn UserRepository>,
        config: Config,
    ) -> Self {
        Self {
            mpesa_repo,
            wallet_repo,
            user_repo,
            config,
        }
    }

    /// Generate Daraja API access token.
    async fn get_access_token(&self) -> Result<String, DomainError> {
        let credentials = format!(
            "{}:{}",
            self.config.mpesa_consumer_key,
            self.config.mpesa_consumer_secret.expose_secret()
        );
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);

        let client = reqwest::Client::new();
        let url = format!("{}/oauth/v1/generate", self.config.mpesa_base_url);

        let response = client
            .get(&url)
            .header("Authorization", format!("Basic {}", encoded))
            .send()
            .await
            .map_err(|e| DomainError::Payment(e.to_string()))?;

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| DomainError::Payment(e.to_string()))?;

        body["access_token"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| DomainError::Payment("No access token in response".into()))
    }

    /// Generate password for STK Push: BusinessShortCode + PassKey + Timestamp
    fn generate_password(&self) -> String {
        let timestamp = Utc::now().format("%Y%m%d%H%M%S").to_string();
        let payload = format!(
            "{}{}{}",
            self.config.mpesa_shortcode, self.config.mpesa_passkey, timestamp
        );
        base64::engine::general_purpose::STANDARD.encode(payload)
    }

    // ============================================================
    // Deposits (STK Push)
    // ============================================================

    /// Initiate an STK Push for deposit.
    pub async fn initiate_stk_push(
        &self,
        user_id: Uuid,
        phone_number: &str,
        amount_minor: i64,
    ) -> DomainResult<MpesaTransaction> {
        let amount_kes = amount_minor / 100;

        let transaction = MpesaTransaction {
            id: Uuid::new_v4(),
            user_id,
            direction: MpesaDirection::Deposit,
            // Left unset here on purpose -- filled in with Safaricom's real
            // CheckoutRequestID/MerchantRequestID once the STK request is
            // accepted, below. (Previously this stored a locally-generated
            // placeholder UUID here instead of Safaricom's real ID, which
            // meant the callback handler could never find this row again.)
            checkout_request_id: None,
            merchant_request_id: None,
            amount_minor,
            phone_number: phone_number.to_string(),
            status: TransactionStatus::Pending,
            mpesa_receipt_number: None,
            result_code: None,
            result_desc: None,
            raw_callback: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let saved_tx = self.mpesa_repo.create_transaction(&transaction).await?;

        match self.send_stk_push(phone_number, amount_kes).await {
            Ok((checkout_request_id, merchant_request_id)) => {
                self.mpesa_repo
                    .update_provider_ids(saved_tx.id, Some(checkout_request_id), Some(merchant_request_id))
                    .await
                    .ok();
            }
            Err(e) => {
                tracing::error!("STK Push failed: {}", e);
                self.mpesa_repo
                    .update_status(saved_tx.id, TransactionStatus::Failed, None, None, Some(e.to_string()), None)
                    .await
                    .ok();
                return Err(e);
            }
        }

        Ok(saved_tx)
    }

    /// Send the actual STK Push request to Daraja.
    /// Returns (CheckoutRequestID, MerchantRequestID) -- both are Safaricom's
    /// real identifiers from the response, not locally generated.
    async fn send_stk_push(
        &self,
        phone_number: &str,
        amount_kes: i64,
    ) -> Result<(String, String), DomainError> {
        let access_token = self.get_access_token().await?;
        let password = self.generate_password();
        let timestamp = Utc::now().format("%Y%m%d%H%M%S").to_string();

        let payload = serde_json::json!({
            "BusinessShortCode": self.config.mpesa_shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount_kes,
            "PartyA": phone_number,
            "PartyB": self.config.mpesa_shortcode,
            "PhoneNumber": phone_number,
            "CallBackURL": format!("{}/api/v1/mpesa/callback", self.config.app_base_url),
            "AccountReference": "FootballSlots",
            "TransactionDesc": "Deposit to Football Slots",
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&self.config.mpesa_lipa_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| DomainError::Payment(e.to_string()))?;

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| DomainError::Payment(e.to_string()))?;

        let checkout_request_id = body["CheckoutRequestID"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| DomainError::Payment("No CheckoutRequestID in response".into()))?;
        let merchant_request_id = body["MerchantRequestID"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| DomainError::Payment("No MerchantRequestID in response".into()))?;

        Ok((checkout_request_id, merchant_request_id))
    }

    /// Process the STK callback from M-Pesa.
    pub async fn process_callback(
        &self,
        checkout_request_id: &str,
        payload: serde_json::Value,
    ) -> DomainResult<()> {
        let transaction = self
            .mpesa_repo
            .find_by_checkout_request_id(checkout_request_id)
            .await?
            .ok_or_else(|| DomainError::Payment("Transaction not found".into()))?;

        // Safaricom can retry callbacks (per the migration note on this
        // table) -- without this guard a retry would credit the wallet a
        // second time.
        if transaction.status != TransactionStatus::Pending {
            tracing::info!(
                "Ignoring duplicate deposit callback for tx={} (already {:?})",
                transaction.id,
                transaction.status
            );
            return Ok(());
        }

        let result_code = payload["Body"]["stkCallback"]["ResultCode"].as_i64().unwrap_or(1) as i32;
        let result_desc = payload["Body"]["stkCallback"]["ResultDesc"].as_str().map(String::from);
        let mpesa_receipt = payload["Body"]["stkCallback"]["CallbackMetadata"]["Item"]
            .as_array()
            .and_then(|items| items.iter().find(|item| item["Name"] == "MpesaReceiptNumber"))
            .and_then(|item| item["Value"].as_str())
            .map(String::from);

        let status = if result_code == 0 {
            TransactionStatus::Success
        } else {
            TransactionStatus::Failed
        };

        let updated_tx = self
            .mpesa_repo
            .update_status(transaction.id, status, mpesa_receipt, Some(result_code), result_desc, Some(payload.clone()))
            .await?;

        if status == TransactionStatus::Success {
            let wallet_id = self
                .wallet_repo
                .get_or_create(transaction.user_id, CurrencyType::Real)
                .await?
                .id;

            self.wallet_repo
                .credit(
                    wallet_id, transaction.amount_minor, LedgerEntryType::Deposit,
                    Some("mpesa_transaction".to_string()), Some(transaction.id), None,
                )
                .await?;

            tracing::info!(
                "M-Pesa deposit credited: user={}, amount={}, receipt={:?}",
                transaction.user_id, transaction.amount_minor, updated_tx.mpesa_receipt_number
            );
        }

        Ok(())
    }

    // ============================================================
    // Withdrawals (B2C)
    // ============================================================

    /// Initiate a withdrawal: validates, holds the funds, then submits a
    /// B2C payment. The hold happens *before* the B2C call so the balance
    /// reflects reality immediately; if the call can't even be submitted,
    /// the hold is reversed before returning the error. If it *is*
    /// submitted, the transaction stays `pending` until the async result
    /// callback (`process_b2c_result`) settles or reverses it.
    pub async fn initiate_withdrawal(
        &self,
        user_id: Uuid,
        phone_number: &str,
        amount_minor: i64,
    ) -> DomainResult<MpesaTransaction> {
        let user = self
            .user_repo
            .find_by_id(user_id)
            .await?
            .ok_or(DomainError::UserNotFound)?;

        user.can_withdraw(Utc::now())?;

        if amount_minor <= 0 {
            return Err(DomainError::MinimumWithdrawalNotMet {
                minimum_minor: self.config.real_min_withdrawal,
            });
        }
        if amount_minor < self.config.real_min_withdrawal {
            return Err(DomainError::MinimumWithdrawalNotMet {
                minimum_minor: self.config.real_min_withdrawal,
            });
        }
        if amount_minor > self.config.real_max_withdrawal {
            return Err(DomainError::MaximumWithdrawalExceeded {
                maximum_minor: self.config.real_max_withdrawal,
            });
        }

        let daily_limit = user
            .daily_withdrawal_limit_minor
            .unwrap_or(self.config.daily_withdrawal_limit_minor);
        let already_withdrawn_today = self.wallet_repo.get_today_withdrawals(user_id).await?;
        if already_withdrawn_today + amount_minor > daily_limit {
            return Err(DomainError::WithdrawalLimitExceeded { limit_minor: daily_limit });
        }

        let wallet = self.wallet_repo.get_or_create(user_id, CurrencyType::Real).await?;

        let pending = MpesaTransaction {
            id: Uuid::new_v4(),
            user_id,
            direction: MpesaDirection::Withdrawal,
            checkout_request_id: None,
            merchant_request_id: None,
            amount_minor,
            phone_number: phone_number.to_string(),
            status: TransactionStatus::Pending,
            mpesa_receipt_number: None,
            result_code: None,
            result_desc: None,
            raw_callback: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        // Fails with DomainError::PendingWithdrawalExists if this user
        // already has one in flight (enforced by the DB partial unique
        // index, not just an application-level check).
        let saved_tx = self.mpesa_repo.create_transaction(&pending).await?;

        // Hold the funds -- this is what makes the balance drop immediately,
        // before Safaricom has done anything.
        if let Err(e) = self
            .wallet_repo
            .debit(
                wallet.id, amount_minor, LedgerEntryType::Withdrawal,
                Some("mpesa_transaction".to_string()), Some(saved_tx.id), None,
            )
            .await
        {
            self.mpesa_repo
                .update_status(saved_tx.id, TransactionStatus::Failed, None, None, Some("insufficient balance".to_string()), None)
                .await
                .ok();
            return Err(e);
        }

        let amount_kes = amount_minor / 100;
        match self.send_b2c_payment(phone_number, amount_kes).await {
            Ok((conversation_id, originator_id)) => {
                self.mpesa_repo
                    .update_provider_ids(saved_tx.id, Some(conversation_id), Some(originator_id))
                    .await
                    .ok();
            }
            Err(e) => {
                tracing::error!("B2C withdrawal request failed: {}", e);
                // Never left the platform -- give it back.
                self.wallet_repo
                    .credit(
                        wallet.id, amount_minor, LedgerEntryType::WithdrawalReversal,
                        Some("mpesa_transaction".to_string()), Some(saved_tx.id),
                        Some(serde_json::json!({ "reason": "b2c_submit_failed" })),
                    )
                    .await
                    .ok();
                self.mpesa_repo
                    .update_status(saved_tx.id, TransactionStatus::Failed, None, None, Some(e.to_string()), None)
                    .await
                    .ok();
                return Err(e);
            }
        }

        Ok(saved_tx)
    }

    /// Send the B2C payment request to Daraja.
    /// Returns (ConversationID, OriginatorConversationID).
    async fn send_b2c_payment(
        &self,
        phone_number: &str,
        amount_kes: i64,
    ) -> Result<(String, String), DomainError> {
        let access_token = self.get_access_token().await?;

        let payload = serde_json::json!({
            "InitiatorName": self.config.mpesa_initiator_name,
            "SecurityCredential": self.config.mpesa_security_credential.expose_secret(),
            // Must match the use case Safaricom approved for your B2C
            // shortcode -- "BusinessPayment" is the generic fit for
            // customer payouts/winnings (not SalaryPayment/PromotionPayment).
            "CommandID": "BusinessPayment",
            "Amount": amount_kes,
            "PartyA": self.config.mpesa_b2c_shortcode,
            "PartyB": phone_number,
            "Remarks": "Football Slots withdrawal",
            "QueueTimeOutURL": format!("{}/api/v1/mpesa/b2c/timeout", self.config.app_base_url),
            "ResultURL": format!("{}/api/v1/mpesa/b2c/result", self.config.app_base_url),
            "Occasion": "Withdrawal",
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&self.config.mpesa_b2c_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| DomainError::Payment(e.to_string()))?;

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| DomainError::Payment(e.to_string()))?;

        // A synchronously-rejected request (bad credentials, org account
        // out of float, etc.) comes back with a non-zero ResponseCode and
        // no ConversationID -- treat that as a hard failure here rather
        // than as "submitted, awaiting result".
        let response_code = body["ResponseCode"].as_str().unwrap_or("1");
        if response_code != "0" {
            let desc = body["ResponseDescription"]
                .as_str()
                .unwrap_or("B2C request rejected")
                .to_string();
            return Err(DomainError::Payment(desc));
        }

        let conversation_id = body["ConversationID"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| DomainError::Payment("No ConversationID in B2C response".into()))?;
        let originator_id = body["OriginatorConversationID"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| DomainError::Payment("No OriginatorConversationID in B2C response".into()))?;

        Ok((conversation_id, originator_id))
    }

    /// Process a B2C result (or timeout) callback from M-Pesa. Both
    /// endpoints post the same envelope shape, so one handler covers both.
    pub async fn process_b2c_result(&self, payload: serde_json::Value) -> DomainResult<()> {
        let result = &payload["Result"];
        let conversation_id = result["ConversationID"].as_str().unwrap_or("");
        if conversation_id.is_empty() {
            return Err(DomainError::Payment("Missing ConversationID in B2C result".into()));
        }

        let transaction = self
            .mpesa_repo
            .find_by_checkout_request_id(conversation_id)
            .await?
            .ok_or_else(|| DomainError::Payment("Withdrawal transaction not found".into()))?;

        // Same idempotency concern as deposits: Safaricom can resend these.
        if transaction.status != TransactionStatus::Pending {
            tracing::info!(
                "Ignoring duplicate B2C callback for tx={} (already {:?})",
                transaction.id,
                transaction.status
            );
            return Ok(());
        }

        let result_code = result["ResultCode"].as_i64().unwrap_or(1) as i32;
        let result_desc = result["ResultDesc"].as_str().map(String::from);

        if result_code == 0 {
            let receipt = result["ResultParameters"]["ResultParameter"]
                .as_array()
                .and_then(|items| items.iter().find(|p| p["Key"] == "TransactionReceipt"))
                .and_then(|p| p["Value"].as_str())
                .map(String::from)
                .or_else(|| result["TransactionID"].as_str().map(String::from));

            self.mpesa_repo
                .update_status(transaction.id, TransactionStatus::Success, receipt, Some(result_code), result_desc, Some(payload.clone()))
                .await?;

            tracing::info!(
                "M-Pesa withdrawal completed: user={}, amount={}, tx={}",
                transaction.user_id, transaction.amount_minor, transaction.id
            );
        } else {
            // Failed on Safaricom's side (or timed out) -- give the money back.
            let wallet = self.wallet_repo.get_or_create(transaction.user_id, CurrencyType::Real).await?;

            self.wallet_repo
                .credit(
                    wallet.id, transaction.amount_minor, LedgerEntryType::WithdrawalReversal,
                    Some("mpesa_transaction".to_string()), Some(transaction.id),
                    Some(serde_json::json!({ "result_code": result_code, "result_desc": result_desc })),
                )
                .await?;

            self.mpesa_repo
                .update_status(transaction.id, TransactionStatus::Failed, None, Some(result_code), result_desc, Some(payload.clone()))
                .await?;

            tracing::warn!(
                "M-Pesa withdrawal failed, reversed: user={}, amount={}, tx={}, code={}",
                transaction.user_id, transaction.amount_minor, transaction.id, result_code
            );
        }

        Ok(())
    }
}
