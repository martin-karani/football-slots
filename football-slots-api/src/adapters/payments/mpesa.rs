use async_trait::async_trait;
use base64::Engine;
use chrono::Utc;
use secrecy::ExposeSecret;
use std::sync::Arc;

use crate::config::MpesaConfig;
use crate::domain::models::errors::{DomainError, DomainResult};
use crate::domain::models::payment::{
    MpesaBalanceQuery, PaymentProvider, PaymentTransaction, UnmatchedDeposit,
};
use crate::ports::payments::{
    DepositInitiation, PaymentProviderPort, ProviderEvent, ProviderSubmission, TxLookup,
    WithdrawalInitiation,
};
use crate::ports::repositories::{MpesaOpsRepository, PaymentRepository, UserRepository};

/// M-Pesa adapter — handles all Daraja outbound HTTP.
/// Never writes payment_transactions, wallets, or ledger.
pub struct MpesaAdapter {
    config: MpesaConfig,
    app_base_url: String,
    payment_repo: Arc<dyn PaymentRepository>,
    mpesa_ops_repo: Arc<dyn MpesaOpsRepository>,
    user_repo: Arc<dyn UserRepository>,
    client: reqwest::Client,
}

impl MpesaAdapter {
    pub fn new(
        config: MpesaConfig,
        app_base_url: String,
        payment_repo: Arc<dyn PaymentRepository>,
        mpesa_ops_repo: Arc<dyn MpesaOpsRepository>,
        user_repo: Arc<dyn UserRepository>,
    ) -> Self {
        Self {
            config,
            app_base_url,
            payment_repo,
            mpesa_ops_repo,
            user_repo,
            client: reqwest::Client::new(),
        }
    }


    async fn get_access_token(&self) -> Result<String, DomainError> {
        let credentials = format!(
            "{}:{}",
            self.config.consumer_key,
            self.config.consumer_secret.expose_secret()
        );
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);

        let url = format!(
            "{}/oauth/v1/generate?grant_type=client_credentials",
            self.config.base_url
        );

        let response = self
            .client
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

    /// Normalize phone numbers to Safaricom standard (2547XXXXXXXX or 2541XXXXXXXX).
    pub fn normalize_phone(phone: &str) -> String {
        let cleaned: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
        if cleaned.starts_with("254") && cleaned.len() == 12 {
            cleaned
        } else if cleaned.starts_with('0') && cleaned.len() == 10 {
            format!("254{}", &cleaned[1..])
        } else if (cleaned.starts_with('7') || cleaned.starts_with('1')) && cleaned.len() == 9 {
            format!("254{}", cleaned)
        } else {
            cleaned
        }
    }

    fn generate_password(&self) -> String {
        let timestamp = Utc::now().format("%Y%m%d%H%M%S").to_string();
        let payload = format!(
            "{}{}{}",
            self.config.shortcode, self.config.passkey, timestamp
        );
        base64::engine::general_purpose::STANDARD.encode(payload)
    }

    /// Parse a decimal KES string like "168.00" into integer minor units
    /// (cents) without going through f64.
    pub fn parse_kes_to_minor_units(s: &str) -> Result<i64, String> {
        let s = s.trim();
        let (whole, frac) = s.split_once('.').unwrap_or((s, ""));
        let whole: i64 = whole
            .parse()
            .map_err(|_| "invalid whole part".to_string())?;
        let frac_padded = format!("{frac:0<2}");
        let frac: i64 = frac_padded[..2]
            .parse()
            .map_err(|_| "invalid fractional part".to_string())?;
        Ok(whole * 100 + frac)
    }

    /// Parse the Safaricom AccountBalance callback string.
    pub fn parse_safaricom_balance_string(
        raw: &str,
    ) -> (Option<i64>, Option<i64>, Option<i64>, Option<i64>) {
        let mut working = None;
        let mut utility = None;
        let mut merchant = None;
        let mut charges = None;

        for part in raw.split('&') {
            let fields: Vec<&str> = part.split('|').collect();
            if fields.len() >= 3 {
                let name = fields[0].trim();
                let balance = fields[2].trim();
                let minor = Self::parse_kes_to_minor_units(balance).ok();

                match name {
                    "Working Account" => working = minor,
                    "Utility Account" => utility = minor,
                    "Merchant Account" => merchant = minor,
                    "Charges Paid Account" => charges = minor,
                    _ => {}
                }
            }
        }
        (working, utility, merchant, charges)
    }


    async fn send_stk_push(
        &self,
        phone_number: &str,
        amount_kes: i64,
    ) -> ProviderSubmission<DepositInitiation> {
        let access_token = match self.get_access_token().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!(error = %e, "Failed to get M-Pesa OAuth access token");
                return ProviderSubmission::Rejected(format!("Failed to get access token: {}", e));
            }
        };

        let normalized_phone = Self::normalize_phone(phone_number);
        let password = self.generate_password();
        let timestamp = Utc::now().format("%Y%m%d%H%M%S").to_string();
        let callback_url = format!("{}/api/v1/payments/callbacks/stk_callback", self.app_base_url);

        let payload = serde_json::json!({
            "BusinessShortCode": self.config.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount_kes,
            "PartyA": normalized_phone,
            "PartyB": self.config.shortcode,
            "PhoneNumber": normalized_phone,
            "CallBackURL": callback_url,
            "AccountReference": "FootballSlots",
            "TransactionDesc": "Deposit to Football Slots",
        });

        

        let response = self
            .client
            .post(&self.config.lipa_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await;

        match response {
            Ok(resp) => {
                let body = match resp.json::<serde_json::Value>().await {
                    Ok(b) => b,
                    Err(e) => {
                        tracing::error!(error = %e, "Failed to parse STK push response");
                        return ProviderSubmission::Unknown(format!(
                            "Failed to parse STK response: {}",
                            e
                        ))
                    }
                };


                let checkout_request_id = body["CheckoutRequestID"].as_str().map(String::from);
                let merchant_request_id = body["MerchantRequestID"].as_str().map(String::from);

                if let Some(cid) = &checkout_request_id {
                    if !cid.is_empty() {
                        return ProviderSubmission::Accepted(DepositInitiation {
                            provider_checkout_id: checkout_request_id,
                            provider_merchant_id: merchant_request_id,
                            message: "STK Push sent".to_string(),
                        });
                    }
                }

                let desc = body["errorMessage"]
                    .as_str()
                    .or_else(|| body["ErrorMessage"].as_str())
                    .or_else(|| body["ResponseDescription"].as_str())
                    .or_else(|| body["customerMessage"].as_str())
                    .unwrap_or("STK Push rejected");
                tracing::error!(reason = %desc, "Daraja STK push rejected");
                ProviderSubmission::Rejected(desc.to_string())
            }
            Err(e) if e.is_timeout() || e.is_connect() => {
                tracing::error!(error = %e, "STK push network error");
                ProviderSubmission::Unknown(format!("STK Push network error: {}", e))
            }
            Err(e) => {
                tracing::error!(error = %e, "STK push error");
                ProviderSubmission::Unknown(format!("STK Push error: {}", e))
            }
        }
    }


    async fn send_b2c_payment(
        &self,
        tx: &PaymentTransaction,
    ) -> ProviderSubmission<WithdrawalInitiation> {
        let access_token = match self.get_access_token().await {
            Ok(t) => t,
            Err(e) => {
                return ProviderSubmission::Rejected(format!("Failed to get access token: {}", e))
            }
        };

        let conversation_id = tx
            .provider_conversation_id
            .as_deref()
            .unwrap_or_else(|| "");
        let phone = &tx.phone_number;
        let amount_kes = tx.amount_minor / 100;

        let sec_cred = self.config.security_credential.expose_secret();
        if sec_cred.is_empty() {
            tracing::warn!(
                "M-Pesa B2C Security Credential not configured in dev/sandbox — simulating acceptance for testing."
            );
            return ProviderSubmission::Accepted(WithdrawalInitiation {
                message: "B2C payout request accepted (dev simulation)".to_string(),
            });
        }

        let payload = serde_json::json!({
            "OriginatorConversationID": conversation_id,
            "InitiatorName": self.config.initiator_name,
            "SecurityCredential": sec_cred,
            "CommandID": "BusinessPayment",
            "Amount": amount_kes,
            "PartyA": self.config.b2c_shortcode,
            "PartyB": phone,
            "Remarks": "Football Slots withdrawal",
            "QueueTimeOutURL": format!("{}/api/v1/payments/callbacks/b2c_timeout", self.app_base_url),
            "ResultURL": format!("{}/api/v1/payments/callbacks/b2c_result", self.app_base_url),
            "Occasion": "Withdrawal",
        });

        let response = self
            .client
            .post(&self.config.b2c_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await;

        match response {
            Ok(resp) => {
                let body = match resp.json::<serde_json::Value>().await {
                    Ok(b) => b,
                    Err(e) => {
                        return ProviderSubmission::Unknown(format!(
                            "Failed to parse B2C response: {}",
                            e
                        ))
                    }
                };

                let response_code = body["ResponseCode"].as_str().unwrap_or("1");
                if response_code == "0" {
                    ProviderSubmission::Accepted(WithdrawalInitiation {
                        message: "B2C payment submitted".to_string(),
                    })
                } else {
                    let desc = body["ResponseDescription"]
                        .as_str()
                        .unwrap_or("B2C request rejected")
                        .to_string();
                    ProviderSubmission::Rejected(desc)
                }
            }
            Err(e) if e.is_timeout() || e.is_connect() => {
                ProviderSubmission::Unknown(format!("B2C network error: {}", e))
            }
            Err(e) => ProviderSubmission::Unknown(format!("B2C error: {}", e)),
        }
    }


    pub async fn resolve_user_from_c2b_ref(
        &self,
        bill_ref: &str,
        msisdn: Option<&str>,
    ) -> DomainResult<Option<uuid::Uuid>> {
        let trimmed_ref = bill_ref.trim();

        if !trimmed_ref.is_empty() {
            if let Ok(user_id) = trimmed_ref.parse::<uuid::Uuid>() {
                if self.user_repo.find_by_id(user_id).await?.is_some() {
                    return Ok(Some(user_id));
                }
            }

            let norm_bill_ref = Self::normalize_phone(trimmed_ref);
            if let Some(user) = self.user_repo.find_by_phone(&norm_bill_ref).await? {
                return Ok(Some(user.id));
            }
        }

        if let Some(phone) = msisdn {
            let trimmed_phone = phone.trim();
            if !trimmed_phone.is_empty() {
                let norm_phone = Self::normalize_phone(trimmed_phone);
                if let Some(user) = self.user_repo.find_by_phone(&norm_phone).await? {
                    return Ok(Some(user.id));
                }
            }
        }

        Ok(None)
    }


    pub async fn register_c2b_urls(&self) -> DomainResult<()> {
        let access_token = self.get_access_token().await?;
        let payload = serde_json::json!({
            "ShortCode": self.config.shortcode,
            "ResponseType": "Completed",
            "ConfirmationURL": format!("{}/api/v1/payments/callbacks/c2b_confirmation", self.app_base_url),
            "ValidationURL": format!("{}/api/v1/payments/callbacks/c2b_validation", self.app_base_url)
        });

        let response = self
            .client
            .post(&self.config.c2b_register_url)
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
            let desc = body["ResponseDescription"].as_str().unwrap_or("");
            if desc.contains("already registered") || desc.contains("already Registered") {
                return Ok(());
            }
            return Err(DomainError::Payment(format!(
                "C2B register failed: {}",
                desc
            )));
        }

        Ok(())
    }


    pub async fn register_pull_transactions(&self) -> DomainResult<()> {
        let access_token = self.get_access_token().await?;

        let payload = serde_json::json!({
            "ShortCode": self.config.shortcode,
            "RequestType": "Pull",
            "NominatedNumber": self.config.nominated_number,
            "CallBackURL": format!("{}/api/v1/payments/callbacks/c2b_confirmation", self.app_base_url)
        });

        let response = self
            .client
            .post(&self.config.pull_register_url)
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

        match response_status {
            "1000" => {
                Ok(())
            }
            "1001" => {
                Ok(())
            }
            _ => Err(DomainError::Payment(format!(
                "Pull Transactions register failed: {} ({})",
                description, response_status
            ))),
        }
    }

    pub async fn query_pull_transactions(
        &self,
        start_date: &str,
        end_date: &str,
        offset: i32,
    ) -> DomainResult<Vec<serde_json::Value>> {
        let access_token = self.get_access_token().await?;
        let payload = serde_json::json!({
            "ShortCode": self.config.shortcode,
            "StartDate": start_date,
            "EndDate": end_date,
            "OffSetValue": offset.to_string()
        });

        let response = self
            .client
            .post(&self.config.pull_query_url)
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
            if msg.contains("No transactions") {
                return Ok(Vec::new());
            }
            return Err(DomainError::Payment(format!("Pull query failed: {}", msg)));
        }

        let transactions = body["Response"]
            .as_array()
            .and_then(|outer| outer.first())
            .and_then(|inner| inner.as_array())
            .cloned()
            .unwrap_or_default();

        Ok(transactions)
    }

    pub async fn reconcile_missed_transactions(&self) -> DomainResult<i64> {
        let now = Utc::now();
        let start = now - chrono::Duration::hours(48);
        let start_str = start.format("%Y-%m-%d %H:%M:%S").to_string();
        let end_str = now.format("%Y-%m-%d %H:%M:%S").to_string();

        let mut offset = 0;
        let mut credited = 0i64;

        loop {
            let transactions = self
                .query_pull_transactions(&start_str, &end_str, offset)
                .await?;
            if transactions.is_empty() {
                break;
            }

            for tx in &transactions {
                let trans_id = tx["transactionId"].as_str().unwrap_or("");
                let amount_str = tx["amount"].as_str().unwrap_or("0");
                let _msisdn = tx["msisdn"].as_str().unwrap_or("");
                let bill_ref = tx["billreference"].as_str().unwrap_or("");

                if trans_id.is_empty() {
                    continue;
                }

                if self
                    .payment_repo
                    .find_by_receipt("mpesa", trans_id)
                    .await
                    .ok()
                    .flatten()
                    .is_some()
                {
                    continue;
                }

                let msisdn_str = tx["msisdn"].as_str();
                if let Some(user_id) = self
                    .resolve_user_from_c2b_ref(bill_ref, msisdn_str)
                    .await
                    .ok()
                    .flatten()
                {
                    if let Ok(amount_minor) = Self::parse_kes_to_minor_units(amount_str) {
                        match self
                            .payment_repo
                            .complete_manual_deposit(
                                user_id,
                                "mpesa",
                                amount_minor,
                                "KES",
                                trans_id,
                                Some(bill_ref),
                                Some(tx.clone()),
                            )
                            .await
                        {
                            Ok(_) => {
                                credited += 1;
                                
                            }
                            Err(_) => {
                            }
                        }
                    }
                }
            }

            if transactions.len() < 100 {
                break;
            }
            offset += 100;
        }

        
        Ok(credited)
    }


    pub async fn query_account_balance(&self) -> DomainResult<MpesaBalanceQuery> {
        let access_token = self.get_access_token().await?;

        let payload = serde_json::json!({
            "Initiator": self.config.initiator_name,
            "SecurityCredential": self.config.security_credential.expose_secret(),
            "CommandID": "AccountBalance",
            "PartyA": self.config.b2c_shortcode,
            "IdentifierType": "4",
            "Remarks": "Automated Float Check",
            "QueueTimeOutURL": format!("{}/api/v1/payments/callbacks/accountbalance_timeout", self.app_base_url),
            "ResultURL": format!("{}/api/v1/payments/callbacks/accountbalance_result", self.app_base_url)
        });

        let response = self
            .client
            .post(&self.config.account_balance_url)
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
            return Err(DomainError::Payment(
                "No OriginatorConversationID in Account Balance response".into(),
            ));
        }

        self.mpesa_ops_repo
            .create_balance_query(&originator_id)
            .await
    }

    pub async fn process_account_balance_callback(
        &self,
        payload: serde_json::Value,
    ) -> DomainResult<()> {
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

            let (working, utility, merchant, charges) =
                Self::parse_safaricom_balance_string(balance_str);

            self.mpesa_ops_repo
                .update_balance_result(
                    originator_id,
                    "success",
                    working,
                    utility,
                    merchant,
                    charges,
                    Some(payload),
                )
                .await?;

            
        } else {
            self.mpesa_ops_repo
                .update_balance_result(
                    originator_id,
                    "failed",
                    None,
                    None,
                    None,
                    None,
                    Some(payload),
                )
                .await?;
        }

        Ok(())
    }

    pub async fn get_latest_balance(&self) -> DomainResult<Option<MpesaBalanceQuery>> {
        self.mpesa_ops_repo.get_latest_balance().await
    }


    pub async fn business_pay_bill(
        &self,
        amount_minor: i64,
        paybill_number: &str,
        account_reference: &str,
        remarks: &str,
    ) -> DomainResult<serde_json::Value> {
        let access_token = self.get_access_token().await?;

        let payload = serde_json::json!({
            "Initiator": self.config.initiator_name,
            "SecurityCredential": self.config.security_credential.expose_secret(),
            "CommandID": "BusinessPayBill",
            "SenderIdentifierType": "4",
            "ReceiverIdentifierType": "4",
            "Amount": amount_minor,
            "PartyA": self.config.b2c_shortcode,
            "PartyB": paybill_number,
            "AccountReference": account_reference,
            "Remarks": remarks,
            "QueueTimeOutURL": format!("{}/api/v1/payments/callbacks/b2b_timeout", self.app_base_url),
            "ResultURL": format!("{}/api/v1/payments/callbacks/b2b_result", self.app_base_url),
        });

        let response = self
            .client
            .post(&self.config.b2b_url)
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
            return Err(DomainError::Payment(format!(
                "B2B request rejected: {}",
                desc
            )));
        }

        Ok(body)
    }

    pub async fn process_b2b_result(&self, payload: serde_json::Value) -> DomainResult<()> {
        let result = &payload["Result"];
        let originator_id = result["OriginatorConversationID"].as_str().unwrap_or("");
        let result_code = result["ResultCode"].as_i64().unwrap_or(1);
        let result_desc = result["ResultDesc"].as_str().unwrap_or("");

        if result_code == 0 {
            
        } else {
            tracing::warn!(
                "B2B payment failed: originator_id={}, code={}, desc={}",
                originator_id,
                result_code,
                result_desc
            );
        }

        Ok(())
    }


    pub async fn list_unmatched_deposits(
        &self,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<UnmatchedDeposit>> {
        self.payment_repo
            .list_unmatched_deposits(limit, offset)
            .await
    }

    pub async fn resolve_unmatched_deposit(
        &self,
        deposit_id: uuid::Uuid,
        user_id: uuid::Uuid,
    ) -> DomainResult<UnmatchedDeposit> {
        self.payment_repo
            .resolve_unmatched_deposit(deposit_id, user_id)
            .await
    }
}

#[async_trait]
impl PaymentProviderPort for MpesaAdapter {
    fn provider(&self) -> PaymentProvider {
        PaymentProvider::Mpesa
    }

    async fn initiate_deposit(
        &self,
        tx: &PaymentTransaction,
    ) -> ProviderSubmission<DepositInitiation> {
        let amount_kes = tx.amount_minor / 100;
        self.send_stk_push(&tx.phone_number, amount_kes).await
    }

    async fn initiate_withdrawal(
        &self,
        tx: &PaymentTransaction,
    ) -> ProviderSubmission<WithdrawalInitiation> {
        self.send_b2c_payment(tx).await
    }

    async fn process_webhook(
        &self,
        webhook: &str,
        payload: serde_json::Value,
    ) -> DomainResult<Option<ProviderEvent>> {
        let payload_clone = payload.clone();

        match webhook {
            "stk_callback" => {
                let checkout_id = payload_clone["Body"]["stkCallback"]["CheckoutRequestID"]
                    .as_str()
                    .unwrap_or("");
                let result_code = payload_clone["Body"]["stkCallback"]["ResultCode"]
                    .as_i64()
                    .unwrap_or(1) as i32;
                let result_desc = payload_clone["Body"]["stkCallback"]["ResultDesc"]
                    .as_str()
                    .map(String::from);

                if result_code == 0 {
                    let amount_from_callback = payload_clone["Body"]["stkCallback"]
                        ["CallbackMetadata"]["Item"]
                        .as_array()
                        .and_then(|items| items.iter().find(|item| item["Name"] == "Amount"))
                        .and_then(|item| item["Value"].as_i64())
                        .unwrap_or(0);
                    // FIX #1: Daraja returns Amount in WHOLE KES (same units we sent in STK Push).
                    // We MUST convert to minor units (cents) before passing to the gateway,
                    // otherwise the amount verification fails: amount_kes * 1 != amount_minor_stored * 100.
                    let amount_minor = amount_from_callback.checked_mul(100).unwrap_or_else(|| {
                        tracing::error!(
                            "STK callback amount overflow: {} * 100",
                            amount_from_callback
                        );
                        0
                    });

                    let receipt = payload_clone["Body"]["stkCallback"]["CallbackMetadata"]["Item"]
                        .as_array()
                        .and_then(|items| {
                            items
                                .iter()
                                .find(|item| item["Name"] == "MpesaReceiptNumber")
                        })
                        .and_then(|item| item["Value"].as_str())
                        .map(String::from);

                    let msisdn = payload_clone["Body"]["stkCallback"]["CallbackMetadata"]["Item"]
                        .as_array()
                        .and_then(|items| items.iter().find(|item| item["Name"] == "MSISDN"))
                        .and_then(|item| item["Value"].as_str())
                        .map(String::from);

                    Ok(Some(ProviderEvent::DepositSucceeded {
                        lookup: TxLookup::Checkout(checkout_id.to_string()),
                        user_id: None,
                        amount_minor,
                        receipt,
                        reference: None,
                        masked_msisdn: msisdn,
                        raw: payload,
                    }))
                } else {
                    Ok(Some(ProviderEvent::DepositFailed {
                        lookup: TxLookup::Checkout(checkout_id.to_string()),
                        result_code: Some(result_code),
                        result_desc,
                        raw: payload,
                    }))
                }
            }
            "b2c_result" | "b2c_timeout" => {
                let result = &payload_clone["Result"];
                let conversation_id = result["OriginatorConversationID"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .or_else(|| result["ConversationID"].as_str())
                    .unwrap_or("");
                let result_code = result["ResultCode"].as_i64().unwrap_or(1) as i32;
                let result_desc = result["ResultDesc"].as_str().map(String::from);

                if result_code == 0 {
                    let receipt = result["ResultParameters"]["ResultParameter"]
                        .as_array()
                        .and_then(|items| items.iter().find(|p| p["Key"] == "TransactionReceipt"))
                        .and_then(|p| p["Value"].as_str())
                        .map(String::from)
                        .or_else(|| result["TransactionID"].as_str().map(String::from));

                    Ok(Some(ProviderEvent::WithdrawalSucceeded {
                        lookup: TxLookup::Conversation(conversation_id.to_string()),
                        receipt,
                        raw: payload,
                    }))
                } else {
                    Ok(Some(ProviderEvent::WithdrawalFailed {
                        lookup: TxLookup::Conversation(conversation_id.to_string()),
                        result_code: Some(result_code),
                        result_desc,
                        raw: payload,
                    }))
                }
            }
            "c2b_confirmation" => {
                let trans_id = payload_clone["TransID"].as_str().unwrap_or("").trim();
                if trans_id.is_empty() {
                    return Err(DomainError::Payment(
                        "missing TransID in C2B confirmation".into(),
                    ));
                }

                let amount_str = payload_clone["TransAmount"].as_str().unwrap_or("0");
                let amount_minor = Self::parse_kes_to_minor_units(amount_str).map_err(|e| {
                    DomainError::Payment(format!("invalid TransAmount '{}': {}", amount_str, e))
                })?;

                let msisdn = payload_clone["MSISDN"].as_str().unwrap_or("");
                let bill_ref = payload_clone["BillRefNumber"].as_str().unwrap_or("").trim();

                let user_id = self.resolve_user_from_c2b_ref(bill_ref, Some(msisdn)).await?;

                Ok(Some(ProviderEvent::DepositSucceeded {
                    lookup: TxLookup::Receipt(trans_id.to_string()),
                    user_id,
                    amount_minor,
                    receipt: Some(trans_id.to_string()),
                    reference: Some(bill_ref.to_string()),
                    masked_msisdn: Some(msisdn.to_string()),
                    raw: payload,
                }))
            }
            "c2b_validation" => {
                Ok(None)
            }
            "accountbalance_result" | "accountbalance_timeout" => {
                self.process_account_balance_callback(payload).await?;
                Ok(None)
            }
            "b2b_result" | "b2b_timeout" => {
                self.process_b2b_result(payload).await?;
                Ok(None)
            }
            _ => Ok(None),
        }
    }
}
