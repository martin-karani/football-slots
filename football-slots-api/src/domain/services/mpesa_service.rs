use std::sync::Arc;

use base64::Engine;
use chrono::Utc;
use secrecy::ExposeSecret;
use uuid::Uuid;

use crate::config::Config;
use crate::domain::models::{
    errors::{DomainError, DomainResult},
    mpesa::{MpesaDirection, MpesaTransaction, TransactionStatus},
};
use crate::ports::repositories::{MpesaRepository, WalletRepository};

pub struct MpesaServiceImpl {
    mpesa_repo: Arc<dyn MpesaRepository>,
    wallet_repo: Arc<dyn WalletRepository>,
    config: Config,
}

impl MpesaServiceImpl {
    pub fn new(
        mpesa_repo: Arc<dyn MpesaRepository>,
        wallet_repo: Arc<dyn WalletRepository>,
        config: Config,
    ) -> Self {
        Self {
            mpesa_repo,
            wallet_repo,
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

    /// Initiate an STK Push for deposit.
    pub async fn initiate_stk_push(
        &self,
        user_id: Uuid,
        phone_number: &str,
        amount_minor: i64,
    ) -> DomainResult<MpesaTransaction> {
        // Convert minor units to KES (assuming 100 minor = 1 KES)
        let amount_kes = amount_minor / 100;

        // Create pending transaction record
        let checkout_request_id = Uuid::new_v4().to_string();
        let transaction = MpesaTransaction {
            id: Uuid::new_v4(),
            user_id,
            direction: MpesaDirection::Deposit,
            checkout_request_id: Some(checkout_request_id.clone()),
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

        // Call Daraja API for STK Push
        match self
            .send_stk_push(phone_number, amount_kes, &checkout_request_id)
            .await
        {
            Ok(merchant_request_id) => {
                // Update with merchant request ID
                self.mpesa_repo
                    .update_with_merchant_request_id(saved_tx.id, Some(merchant_request_id))
                    .await
                    .ok();
            }
            Err(e) => {
                tracing::error!("STK Push failed: {}", e);
                self.mpesa_repo
                    .update_status(
                        saved_tx.id,
                        TransactionStatus::Failed,
                        None,
                        None,
                        Some(e.to_string()),
                        None,
                    )
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
        _checkout_request_id: &str,
    ) -> Result<String, DomainError> {
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
            "CallBackURL": format!("{}/api/v1/mpesa/callback", self.get_callback_base_url()),
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

        body["MerchantRequestID"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| DomainError::Payment("No MerchantRequestID in response".into()))
    }

    /// Process the callback from M-Pesa.
    pub async fn process_callback(
        &self,
        checkout_request_id: &str,
        payload: serde_json::Value,
    ) -> DomainResult<()> {
        // Find the transaction
        let transaction = self
            .mpesa_repo
            .find_by_checkout_request_id(checkout_request_id)
            .await?
            .ok_or_else(|| DomainError::Payment("Transaction not found".into()))?;

        // Parse callback result
        let result_code = payload["Body"]["stkCallback"]["ResultCode"]
            .as_i64()
            .unwrap_or(1) as i32;
        let result_desc = payload["Body"]["stkCallback"]["ResultDesc"]
            .as_str()
            .map(String::from);
        let mpesa_receipt = payload["Body"]["stkCallback"]["CallbackMetadata"]["Item"]
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| item["Name"] == "MpesaReceiptNumber")
            })
            .and_then(|item| item["Value"].as_str())
            .map(String::from);

        let status = if result_code == 0 {
            TransactionStatus::Success
        } else {
            TransactionStatus::Failed
        };

        // Update transaction
        let updated_tx = self
            .mpesa_repo
            .update_status(
                transaction.id,
                status,
                mpesa_receipt,
                Some(result_code),
                result_desc,
                Some(payload.clone()),
            )
            .await?;

        // If successful, credit the user's real wallet
        if status == TransactionStatus::Success {
            let wallet_id = self
                .wallet_repo
                .get_or_create(
                    transaction.user_id,
                    crate::domain::models::wallet::CurrencyType::Real,
                )
                .await?
                .id;

            self.wallet_repo
                .credit(
                    wallet_id,
                    transaction.amount_minor,
                    crate::domain::models::wallet::LedgerEntryType::Deposit,
                    Some("mpesa_transaction".to_string()),
                    Some(transaction.id),
                    None,
                )
                .await?;

            tracing::info!(
                "M-Pesa deposit credited: user={}, amount={}, receipt={:?}",
                transaction.user_id,
                transaction.amount_minor,
                updated_tx.mpesa_receipt_number
            );
        }

        Ok(())
    }

    fn get_callback_base_url(&self) -> String {
        // In production, this should be configured
        "https://api.football-slots.com".to_string()
    }
}
