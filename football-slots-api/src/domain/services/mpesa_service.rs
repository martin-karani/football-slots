use std::sync::Arc;

use base64::Engine;
use chrono::Utc;
use secrecy::ExposeSecret;
use uuid::Uuid;

use crate::config::Config;
use crate::domain::models::{
    errors::{DomainError, DomainResult},
    mpesa::{
        AccountBalanceSummary, MpesaAccountBalanceQuery, MpesaDirection, MpesaTransaction,
        TransactionStatus, UnmatchedC2bDeposit,
    },
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

    // ============================================================
    // Auth
    // ============================================================

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

    /// Parse a decimal KES string like "168.00" into integer minor units
    /// (cents) without going through f64, so money amounts never pick up
    /// binary-float rounding error.
    fn parse_kes_to_minor_units(s: &str) -> Result<i64, String> {
        let s = s.trim();
        let (whole, frac) = s.split_once('.').unwrap_or((s, ""));
        let whole: i64 = whole.parse().map_err(|_| "invalid whole part".to_string())?;
        let frac_padded = format!("{frac:0<2}"); // "5" -> "50", "" -> "00"
        let frac: i64 = frac_padded[..2].parse().map_err(|_| "invalid fractional part".to_string())?;
        Ok(whole * 100 + frac)
    }

    /// Parse the Safaricom AccountBalance callback string.
    /// Format: "Working Account|KES|700000.00|...&Utility Account|KES|..."
    fn parse_safaricom_balance_string(raw: &str) -> (Option<i64>, Option<i64>, Option<i64>, Option<i64>) {
        let mut working = None;
        let mut utility = None;
        let mut merchant = None;
        let mut charges = None;

        for part in raw.split('&') {
            let fields: Vec<&str> = part.split('|').collect();
            if fields.len() >= 3 {
                let name = fields[0].trim();
                if let Ok(val) = fields[2].trim().parse::<f64>() {
                    let minor = (val * 100.0).round() as i64;
                    match name {
                        "Working Account" => working = Some(minor),
                        "Utility Account" => utility = Some(minor),
                        "Merchant Account" => merchant = Some(minor),
                        "Charges Paid Account" => charges = Some(minor),
                        _ => {} // Float Account, Organization Settlement, etc.
                    }
                }
            }
        }
        (working, utility, merchant, charges)
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
            checkout_request_id: None,
            merchant_request_id: None,
            amount_minor,
            phone_number: phone_number.to_string(),
            status: TransactionStatus::Pending,
            mpesa_receipt_number: None,
            result_code: None,
            result_desc: None,
            originator_conversation_id: None,
            c2b_bill_ref_number: None,
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
    // Withdrawals (B2C v3)
    // ============================================================

    /// Initiate a withdrawal: validates, holds the funds, then submits a
    /// B2C payment. The hold happens *before* the B2C call so the balance
    /// reflects reality immediately.
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

        if amount_minor <= 0 || amount_minor < self.config.real_min_withdrawal {
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
            originator_conversation_id: None,
            c2b_bill_ref_number: None,
            raw_callback: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let saved_tx = self.mpesa_repo.create_transaction(&pending).await?;

        // Hold the funds before calling Safaricom
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
        match self.send_b2c_payment(saved_tx.id, phone_number, amount_kes).await {
            Ok(_) => {
                // send_b2c_payment marks the transaction as 'submitted' internally
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

    /// Send the B2C payment request to Daraja (v3).
    /// Idempotent: the OriginatorConversationID is minted once per tx_id and
    /// reused on every retry, so a crash/timeout never produces a second
    /// disbursement for the same withdrawal.
    async fn send_b2c_payment(
        &self,
        tx_id: Uuid,
        phone_number: &str,
        amount_kes: i64,
    ) -> Result<(), DomainError> {
        let originator_conversation_id = self
            .mpesa_repo
            .get_or_create_originator_conversation_id(tx_id)
            .await?;

        // Check current status — refuse to resubmit anything Safaricom has
        // already accepted. Only Pending or Failed can be (re)submitted.
        let existing = self.mpesa_repo.find_by_originator_conversation_id(&originator_conversation_id).await.ok().flatten();
        if let Some(t) = &existing {
            match t.status {
                TransactionStatus::Pending | TransactionStatus::Failed => {}
                _ => {
                    tracing::warn!(
                        "send_b2c_payment called again for tx_id={tx_id} in status={:?}; skipping",
                        t.status
                    );
                    return Ok(());
                }
            }
        }

        let access_token = self.get_access_token().await?;

        let payload = serde_json::json!({
            "OriginatorConversationID": originator_conversation_id,
            "InitiatorName": self.config.mpesa_initiator_name,
            "SecurityCredential": self.config.mpesa_security_credential.expose_secret(),
            "CommandID": "BusinessPayment",
            "Amount": amount_kes,
            "PartyA": self.config.mpesa_b2c_shortcode,
            "PartyB": phone_number,
            "Remarks": "Football Slots withdrawal",
            "QueueTimeOutURL": format!("{}/api/v1/mpesa/b2c/timeout", self.config.app_base_url),
            "ResultURL": format!("{}/api/v1/mpesa/b2c/result", self.config.app_base_url),
            // Safaricom's API docs use this exact misspelling — do NOT "fix" it.
            "Occassion": "Withdrawal",
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

        let response_code = body["ResponseCode"].as_str().unwrap_or("1");
        if response_code != "0" {
            let desc = body["ResponseDescription"]
                .as_str()
                .unwrap_or("B2C request rejected")
                .to_string();
            return Err(DomainError::Payment(desc));
        }

        // Safaricom accepted — mark as submitted so we don't resubmit on retry
        self.mpesa_repo
            .mark_transaction_submitted(tx_id, &originator_conversation_id)
            .await?;

        Ok(())
    }

    /// Process a B2C result (or timeout) callback from M-Pesa.
    pub async fn process_b2c_result(&self, payload: serde_json::Value) -> DomainResult<()> {
        let result = &payload["Result"];
        let originator_id = result["OriginatorConversationID"].as_str().unwrap_or("");
        if originator_id.is_empty() {
            return Err(DomainError::Payment("Missing OriginatorConversationID in B2C result".into()));
        }

        let transaction = self
            .mpesa_repo
            .find_by_originator_conversation_id(originator_id)
            .await?
            .ok_or_else(|| DomainError::Payment("Withdrawal transaction not found by OriginatorConversationID".into()))?;

        // Idempotency: Safaricom can resend these.
        if transaction.status != TransactionStatus::Submitted && transaction.status != TransactionStatus::Pending {
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
            // Failed on Safaricom's side (or timed out) — give the money back.
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

    // ============================================================
    // C2B (Manual Paybill Deposits)
    // ============================================================

    /// Registers Confirmation and Validation URLs for C2B Manual Payments.
    /// Per the docs, this is a one-time call in production. In sandbox, you
    /// can call it before each simulation.
    pub async fn register_c2b_urls(&self) -> DomainResult<()> {
        let access_token = self.get_access_token().await?;
        let payload = serde_json::json!({
            "ShortCode": self.config.mpesa_shortcode,
            "ResponseType": "Completed",
            "ConfirmationURL": format!("{}/api/v1/mpesa/c2b/confirmation", self.config.app_base_url),
            "ValidationURL": format!("{}/api/v1/mpesa/c2b/validation", self.config.app_base_url)
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&self.config.mpesa_c2b_register_url)
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

        let response_code = body["ResponseCode"].as_str().unwrap_or("1");
        if response_code != "0" {
            // "Urls are already registered" is expected in production — treat as success
            let desc = body["ResponseDescription"].as_str().unwrap_or("");
            if desc.contains("already registered") || desc.contains("already Registered") {
                tracing::info!("C2B URLs already registered: {}", desc);
                return Ok(());
            }
            return Err(DomainError::Payment(format!("C2B register failed: {}", desc)));
        }

        tracing::info!("C2B URLs registered successfully");
        Ok(())
    }

    /// Process a C2B confirmation callback: a customer manually paid the Paybill.
    ///
    /// Key design decisions:
    /// - MSISDN in C2B v2 confirmation is always masked ("2547 * 126"), so
    ///   BillRefNumber is the ONLY reliable identifier. Users must enter their
    ///   user ID or a generated deposit code as the account reference.
    /// - Transaction insert and wallet credit happen in one DB transaction,
    ///   so "row exists" and "wallet was credited" can never disagree.
    /// - Duplicate detection uses SQLSTATE 23505 (unique_violation), not
    ///   fragile string matching on the error message.
    pub async fn process_c2b_confirmation(&self, payload: serde_json::Value) -> DomainResult<()> {
        let payload_clone = payload.clone();
        let trans_id = payload_clone["TransID"].as_str().unwrap_or("").trim();
        if trans_id.is_empty() {
            tracing::error!("C2B confirmation missing TransID; payload={payload:?}");
            return Err(DomainError::Payment("missing TransID in C2B confirmation".into()));
        }

        let amount_str = payload_clone["TransAmount"].as_str().unwrap_or("0");
        let amount_minor = Self::parse_kes_to_minor_units(amount_str)
            .map_err(|e| DomainError::Payment(format!("invalid TransAmount '{}': {}", amount_str, e)))?;

        let msisdn_masked = payload_clone["MSISDN"].as_str().unwrap_or("");
        let bill_ref = payload_clone["BillRefNumber"].as_str().unwrap_or("").trim();

        // Resolve user from BillRefNumber — this is the only reliable way
        // to identify the account since MSISDN is masked in C2B v2.
        let Some(user_id) = self.resolve_user_from_c2b_ref(bill_ref).await? else {
            // Real money already left the customer's account — quarantine it
            // for manual reconciliation instead of silently dropping it.
            let was_new = self
                .mpesa_repo
                .record_unmatched_c2b_deposit(trans_id, bill_ref, msisdn_masked, amount_minor, payload.clone())
                .await?;

            if was_new {
                tracing::error!(
                    "C2B payment unresolvable, quarantined: TransID={} BillRefNumber='{}' amount_minor={}",
                    trans_id, bill_ref, amount_minor
                );
            } else {
                tracing::info!(
                    "Duplicate confirmation callback for already-quarantined TransID={}",
                    trans_id
                );
            }
            return Ok(());
        };

        // Atomic insert + credit in a single DB transaction
        let mut db_tx = self.wallet_repo.pool().begin().await.map_err(DomainError::from)?;

        // Insert the transaction row
        let insert_result: Result<(uuid::Uuid,), sqlx::Error> = sqlx::query_as(
            r#"
            INSERT INTO mpesa_transactions
                (id, user_id, direction, mpesa_receipt_number, amount_minor, status, c2b_bill_ref_number, raw_callback)
            VALUES ($1, $2, 'deposit', $3, $4, 'success', $5, $6)
            RETURNING id
            "#,
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(trans_id)
        .bind(amount_minor)
        .bind(bill_ref)
        .bind(payload.clone())
        .fetch_one(&mut *db_tx)
        .await;

        match insert_result {
            Ok((tx_id,)) => {
                // Credit the wallet inside the same transaction
                let wallet = sqlx::query_as::<_, crate::domain::models::wallet::Wallet>(
                    r#"INSERT INTO wallets (user_id, currency, balance_minor) VALUES ($1, $2::currency_type, 0)
                       ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = now()
                       RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
                )
                .bind(user_id)
                .bind(CurrencyType::Real)
                .fetch_one(&mut *db_tx)
                .await
                .map_err(DomainError::from)?;

                // Update balance
                sqlx::query(
                    r#"UPDATE wallets SET balance_minor = balance_minor + $1, updated_at = now()
                       WHERE id = $2"#,
                )
                .bind(amount_minor)
                .bind(wallet.id)
                .execute(&mut *db_tx)
                .await
                .map_err(DomainError::from)?;

                // Insert ledger entry
                sqlx::query(
                    r#"INSERT INTO wallet_ledger (wallet_id, entry_type, amount_minor, balance_after_minor,
                       reference_type, reference_id)
                       VALUES ($1, 'c2b_manual', $2, $3, 'mpesa_transaction', $4)"#,
                )
                .bind(wallet.id)
                .bind(amount_minor)
                .bind(wallet.balance_minor + amount_minor)
                .bind(tx_id)
                .execute(&mut *db_tx)
                .await
                .map_err(DomainError::from)?;

                db_tx.commit().await.map_err(DomainError::from)?;

                tracing::info!(
                    "C2B manual deposit credited: user={}, amount={}, TransID={}",
                    user_id, amount_minor, trans_id
                );
                Ok(())
            }
            Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => {
                // unique_violation on mpesa_receipt_number — already credited
                db_tx.rollback().await.ok();
                tracing::info!("Ignoring duplicate C2B confirmation for TransID={}", trans_id);
                Ok(())
            }
            Err(e) => {
                db_tx.rollback().await.ok();
                Err(DomainError::from(e))
            }
        }
    }

    /// Resolve a user from a C2B BillRefNumber.
    /// The BillRefNumber is what the customer types as the "Account Number"
    /// when paying the Paybill. Users should enter their user UUID or phone
    /// number here.
    async fn resolve_user_from_c2b_ref(&self, bill_ref: &str) -> DomainResult<Option<Uuid>> {
        if bill_ref.is_empty() {
            return Ok(None);
        }

        // Try as UUID first
        if let Ok(user_id) = bill_ref.parse::<Uuid>() {
            if self.user_repo.find_by_id(user_id).await?.is_some() {
                return Ok(Some(user_id));
            }
        }

        // Try as phone number
        if let Some(user) = self.user_repo.find_by_phone(bill_ref).await? {
            return Ok(Some(user.id));
        }

        Ok(None)
    }

    // ============================================================
    // Pull Transactions (Reconciliation)
    // ============================================================

    /// Queries Safaricom for missed C2B transactions within a 48-hour window.
    /// Use this to recover deposits where the user was charged but your server
    /// missed the STK Push callback.
    pub async fn query_pull_transactions(
        &self,
        start_date: &str,
        end_date: &str,
        offset: i32,
    ) -> DomainResult<Vec<serde_json::Value>> {
        let access_token = self.get_access_token().await?;
        let payload = serde_json::json!({
            "ShortCode": self.config.mpesa_shortcode,
            "StartDate": start_date,
            "EndDate": end_date,
            "OffSetValue": offset.to_string()
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&self.config.mpesa_pull_query_url)
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

        let response_code = body["ResponseCode"].as_str().unwrap_or("1");
        if response_code != "1000" {
            let msg = body["ResponseMessage"].as_str().unwrap_or("Unknown error");
            // "No transactions available" is not a real error
            if msg.contains("No transactions") {
                return Ok(Vec::new());
            }
            return Err(DomainError::Payment(format!("Pull query failed: {}", msg)));
        }

        // Parse the nested Response array
        let transactions = body["Response"]
            .as_array()
            .and_then(|outer| outer.first())
            .and_then(|inner| inner.as_array())
            .cloned()
            .unwrap_or_default();

        Ok(transactions)
    }

    /// Reconcile missed transactions: query Safaricom for the last 48 hours,
    /// cross-reference against local transactions, and credit any missing
    /// successful deposits.
    pub async fn reconcile_missed_transactions(&self) -> DomainResult<i64> {
        let now = Utc::now();
        let start = now - chrono::Duration::hours(48);
        let start_str = start.format("%Y-%m-%d %H:%M:%S").to_string();
        let end_str = now.format("%Y-%m-%d %H:%M:%S").to_string();

        let mut offset = 0;
        let mut credited = 0i64;

        loop {
            let transactions = self.query_pull_transactions(&start_str, &end_str, offset).await?;
            if transactions.is_empty() {
                break;
            }

            for tx in &transactions {
                let trans_id = tx["transactionId"].as_str().unwrap_or("");
                let amount_str = tx["amount"].as_str().unwrap_or("0");
                let msisdn = tx["msisdn"].as_str().unwrap_or("");
                let bill_ref = tx["billreference"].as_str().unwrap_or("");

                if trans_id.is_empty() {
                    continue;
                }

                // Check if we already have this transaction
                let existing = self.mpesa_repo.find_by_checkout_request_id(trans_id).await;
                if existing.ok().flatten().is_some() {
                    continue; // Already processed
                }

                // Try to resolve user
                if let Some(user_id) = self.resolve_user_from_c2b_ref(bill_ref).await.ok().flatten() {
                    if let Ok(amount_minor) = Self::parse_kes_to_minor_units(amount_str) {
                        let tx_record = MpesaTransaction {
                            id: Uuid::new_v4(),
                            user_id,
                            direction: MpesaDirection::Deposit,
                            checkout_request_id: Some(trans_id.to_string()),
                            merchant_request_id: None,
                            amount_minor,
                            phone_number: msisdn.to_string(),
                            status: TransactionStatus::Success,
                            mpesa_receipt_number: Some(trans_id.to_string()),
                            result_code: Some(0),
                            result_desc: Some("Reconciled via Pull API".to_string()),
                            originator_conversation_id: None,
                            c2b_bill_ref_number: Some(bill_ref.to_string()),
                            raw_callback: Some(tx.clone()),
                            created_at: Utc::now(),
                            updated_at: Utc::now(),
                        };

                        match self.mpesa_repo.create_transaction(&tx_record).await {
                            Ok(_) => {
                                let wallet_id = self
                                    .wallet_repo
                                    .get_or_create(user_id, CurrencyType::Real)
                                    .await
                                    .ok()
                                    .map(|w| w.id);
                                if let Some(wid) = wallet_id {
                                    self.wallet_repo
                                        .credit(
                                            wid, amount_minor, LedgerEntryType::C2bManual,
                                            Some("pull_reconciliation".to_string()), Some(tx_record.id), None,
                                        )
                                        .await
                                        .ok();
                                    credited += 1;
                                    tracing::info!(
                                        "Reconciled missed deposit: user={}, amount={}, TransID={}",
                                        user_id, amount_minor, trans_id
                                    );
                                }
                            }
                            Err(DomainError::Database(e)) => {
                                // Unique violation is OK — already exists
                                if let Some(db_err) = e.as_database_error() {
                                    if db_err.code().as_deref() != Some("23505") {
                                        tracing::error!("Reconciliation insert failed: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::error!("Reconciliation failed for TransID={}: {}", trans_id, e);
                            }
                        }
                    }
                }
            }

            if transactions.len() < 100 {
                break; // No more pages
            }
            offset += 100;
        }

        tracing::info!("Reconciliation complete: {} transactions credited", credited);
        Ok(credited)
    }

    // ============================================================
    // Account Balance API
    // ============================================================

    /// Admin triggers this to check the house float.
    /// Returns immediately; the actual balance arrives via the ResultURL webhook.
    pub async fn query_account_balance(&self) -> DomainResult<MpesaAccountBalanceQuery> {
        let access_token = self.get_access_token().await?;

        let payload = serde_json::json!({
            "Initiator": self.config.mpesa_initiator_name,
            "SecurityCredential": self.config.mpesa_security_credential.expose_secret(),
            "CommandID": "AccountBalance",
            "PartyA": self.config.mpesa_b2c_shortcode,
            "IdentifierType": "4",
            "Remarks": "Automated Float Check",
            "QueueTimeOutURL": format!("{}/api/v1/mpesa/accountbalance/timeout", self.config.app_base_url),
            "ResultURL": format!("{}/api/v1/mpesa/accountbalance/result", self.config.app_base_url)
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&self.config.mpesa_account_balance_url)
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

        let originator_id = body["OriginatorConversationID"]
            .as_str()
            .unwrap_or("")
            .to_string();

        if originator_id.is_empty() {
            return Err(DomainError::Payment("No OriginatorConversationID in Account Balance response".into()));
        }

        // Save to DB so the webhook can find it later
        self.mpesa_repo.create_account_balance_query(&originator_id).await
    }

    /// Webhook handler for the Account Balance async result.
    pub async fn process_account_balance_callback(&self, payload: serde_json::Value) -> DomainResult<()> {
        let payload_clone = payload.clone();
        let result = &payload_clone["Result"];
        let originator_id = result["OriginatorConversationID"].as_str().unwrap_or("");
        let result_code = result["ResultCode"].as_i64().unwrap_or(1) as i32;

        if result_code == 0 {
            let balance_str = result["ResultParameters"]["ResultParameter"]
                .as_array()
                .and_then(|items| items.iter().find(|p| p["Key"] == "AccountBalance"))
                .and_then(|p| p["Value"].as_str())
                .unwrap_or("");

            let (working, utility, merchant, charges) = Self::parse_safaricom_balance_string(balance_str);

            self.mpesa_repo.update_account_balance_result(
                originator_id, "success", working, utility, merchant, charges, Some(payload)
            ).await?;

            tracing::info!(
                "M-Pesa Account Balance Updated: Utility={:?}, Working={:?}, Merchant={:?}",
                utility, working, merchant
            );
        } else {
            self.mpesa_repo.update_account_balance_result(
                originator_id, "failed", None, None, None, None, Some(payload)
            ).await?;
        }

        Ok(())
    }

    /// Get the latest cached account balance summary.
    pub async fn get_latest_balance(&self) -> DomainResult<Option<AccountBalanceSummary>> {
        let query = self.mpesa_repo.get_latest_account_balance().await?;
        Ok(query.map(|q| AccountBalanceSummary {
            working_account_kes: q.working_account_minor.map(|m| m as f64 / 100.0),
            utility_account_kes: q.utility_account_minor.map(|m| m as f64 / 100.0),
            merchant_account_kes: q.merchant_account_minor.map(|m| m as f64 / 100.0),
            charges_paid_kes: q.charges_paid_account_minor.map(|m| m as f64 / 100.0),
            last_updated: q.updated_at,
        }))
    }

    // ============================================================
    // Admin: Unmatched Deposits
    // ============================================================

    /// List unresolved unmatched C2B deposits for manual reconciliation.
    pub async fn list_unmatched_deposits(&self, limit: i64, offset: i64) -> DomainResult<Vec<UnmatchedC2bDeposit>> {
        self.mpesa_repo.list_unmatched_deposits(limit, offset).await
    }

    /// Resolve an unmatched deposit by marking it resolved with a user ID.
    /// The actual wallet credit must be done separately by the admin.
    pub async fn resolve_unmatched_deposit(&self, deposit_id: Uuid, user_id: Uuid) -> DomainResult<UnmatchedC2bDeposit> {
        self.mpesa_repo.resolve_unmatched_deposit(deposit_id, user_id).await
    }

    // ============================================================
    // Pull Transactions — Register
    // ============================================================

    /// Registers the shortcode for Pull Transactions API.
    /// Per the docs, this is a one-time process required to enable
    /// transaction pulling. Must be called before query_pull_transactions.
    pub async fn register_pull_transactions(&self) -> DomainResult<()> {
        let access_token = self.get_access_token().await?;

        // NominatedNumber is the Safaricom MSISDN associated with the
        // organization account. Use the shortcode's registered number.
        let payload = serde_json::json!({
            "ShortCode": self.config.mpesa_shortcode,
            "RequestType": "Pull",
            "NominatedNumber": self.config.mpesa_nominated_number,
            "CallBackURL": format!("{}/api/v1/mpesa/c2b/confirmation", self.config.app_base_url)
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&self.config.mpesa_pull_register_url)
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

        let response_status = body["ResponseStatus"].as_str().unwrap_or("");
        let description = body["ResponseDescription"].as_str().unwrap_or("");

        // 1000 = Registered Successfully, 1001 = Already Registered
        match response_status {
            "1000" => {
                tracing::info!("Pull Transactions registered successfully");
                Ok(())
            }
            "1001" => {
                tracing::info!("Pull Transactions already registered: {}", description);
                Ok(())
            }
            _ => Err(DomainError::Payment(format!(
                "Pull Transactions register failed: {} ({})",
                description, response_status
            ))),
        }
    }

    // ============================================================
    // B2B — Business Pay Bill (pay from business to another Pay Bill)
    // ============================================================

    /// Pays a bill directly from the organization's MMF/Working account
    /// to another Pay Bill number. Useful for paying suppliers or
    /// transferring funds between organizations.
    pub async fn business_pay_bill(
        &self,
        amount_minor: i64,
        paybill_number: &str,
        account_reference: &str,
        remarks: &str,
    ) -> DomainResult<serde_json::Value> {
        let access_token = self.get_access_token().await?;

        let payload = serde_json::json!({
            "Initiator": self.config.mpesa_initiator_name,
            "SecurityCredential": self.config.mpesa_security_credential.expose_secret(),
            "CommandID": "BusinessPayBill",
            "SenderIdentifierType": "4",
            "ReceiverIdentifierType": "4",
            "Amount": amount_minor,
            "PartyA": self.config.mpesa_b2c_shortcode,
            "PartyB": paybill_number,
            "AccountReference": account_reference,
            "Remarks": remarks,
            "QueueTimeOutURL": format!("{}/api/v1/mpesa/b2b/timeout", self.config.app_base_url),
            "ResultURL": format!("{}/api/v1/mpesa/b2b/result", self.config.app_base_url),
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&self.config.mpesa_b2b_url)
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

        let response_code = body["ResponseCode"].as_str().unwrap_or("1");
        if response_code != "0" {
            let desc = body["ResponseDescription"]
                .as_str()
                .unwrap_or("B2B request rejected");
            return Err(DomainError::Payment(format!("B2B request rejected: {}", desc)));
        }

        tracing::info!(
            "B2B BusinessPayBill submitted: amount={}, paybill={}, originator_id={}",
            amount_minor,
            paybill_number,
            body["OriginatorConversationID"].as_str().unwrap_or("")
        );

        Ok(body)
    }

    /// Process a B2B result callback from M-Pesa.
    pub async fn process_b2b_result(&self, payload: serde_json::Value) -> DomainResult<()> {
        let result = &payload["Result"];
        let originator_id = result["OriginatorConversationID"].as_str().unwrap_or("");
        let result_code = result["ResultCode"].as_i64().unwrap_or(1);
        let result_desc = result["ResultDesc"].as_str().unwrap_or("");

        if result_code == 0 {
            tracing::info!(
                "B2B payment successful: originator_id={}, desc={}",
                originator_id, result_desc
            );
        } else {
            tracing::warn!(
                "B2B payment failed: originator_id={}, code={}, desc={}",
                originator_id, result_code, result_desc
            );
        }

        Ok(())
    }
}
