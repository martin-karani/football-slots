use async_trait::async_trait;
use reqwest::Client;
use secrecy::ExposeSecret;
use serde::Serialize;

use crate::config::SmsConfig;
use crate::domain::models::errors::{DomainError, DomainResult};
use crate::ports::notifications::{OutboundSms, SmsGatewayPort};

/// Celcom Africa SMS gateway adapter.
///
/// POSTs JSON to `SMS_BASE_URL`. In dev that points at Buggregator's SMS
/// capture endpoint; in prod it points at the real Celcom Africa endpoint.
/// Same request shape, no branching on environment.
pub struct CelcomAfricaSmsGateway {
    client: Client,
    config: SmsConfig,
}

#[derive(Serialize)]
#[allow(non_snake_case)]
struct CelcomSmsRequest {
    apikey: String,
    partnerID: String,
    message: String,
    shortcode: String,
    mobile: String,
    pass_type: String,
}

impl CelcomAfricaSmsGateway {
    pub fn new(config: SmsConfig) -> Self {
        Self {
            client: Client::new(),
            config,
        }
    }
}

#[async_trait]
impl SmsGatewayPort for CelcomAfricaSmsGateway {
    async fn send_sms(&self, sms: OutboundSms) -> DomainResult<()> {
        tracing::info!(
            to = %sms.to_msisdn,
            message_length = sms.message.len(),
            base_url = %self.config.base_url,
            "Sending SMS via Celcom Africa gateway"
        );

        // Detect Buggregator (dev) vs real Celcom Africa (prod).
        // Buggregator's SMS capture expects {to, message} at top level;
        // Celcom Africa expects {mobile, message, apikey, ...}.
        // Same adapter, config decides — the request body shape adapts to
        // the target endpoint so the developer actually sees the message.
        let is_buggregator = self.config.base_url.contains("buggregator")
            || self.config.base_url.contains("localhost:8000")
            || self.config.base_url.contains("127.0.0.1:8000")
            || self.config.base_url.contains(":8000")
            || self.config.base_url.ends_with("/sms");

        let resp = if is_buggregator {
            // Buggregator-friendly format
            let body = serde_json::json!({
                "to": sms.to_msisdn,
                "message": sms.message,
                "from": self.config.shortcode,
            });
            tracing::debug!(payload = %body, "Sending SMS in Buggregator format");
            self.client
                .post(&self.config.base_url)
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    tracing::error!(error = %e, "SMS gateway HTTP request failed");
                    DomainError::Repository(anyhow::anyhow!("SMS gateway request failed: {e}"))
                })?
        } else {
            // Real Celcom Africa format
            let req = CelcomSmsRequest {
                apikey: self.config.api_key.expose_secret().clone(),
                partnerID: self.config.partner_id.clone(),
                message: sms.message.clone(),
                shortcode: self.config.shortcode.clone(),
                mobile: sms.to_msisdn.clone(),
                pass_type: self.config.pass_type.clone(),
            };
            self.client
                .post(&self.config.base_url)
                .json(&req)
                .send()
                .await
                .map_err(|e| {
                    tracing::error!(error = %e, "SMS gateway HTTP request failed");
                    DomainError::Repository(anyhow::anyhow!("SMS gateway request failed: {e}"))
                })?
        };

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            tracing::error!(
                status = %status,
                response_body = %body,
                "SMS gateway returned non-2xx"
            );
            return Err(DomainError::Repository(anyhow::anyhow!(
                "SMS gateway returned status {status}: {body}"
            )));
        }

        // Parse response.
        // Buggregator returns {"status": true} — that's success.
        // Celcom Africa returns {"responses": [{"respose-code": "200", ...}]}.
        let body_text = resp.text().await.unwrap_or_default();
        tracing::debug!(
            response_body = %body_text,
            to = %sms.to_msisdn,
            "SMS gateway response"
        );

        let body: serde_json::Value = serde_json::from_str(&body_text).unwrap_or_else(|_| {
            tracing::debug!("SMS gateway returned non-JSON response, treating as success");
            serde_json::json!({})
        });

        // Only validate Celcom Africa's response-code; Buggregator is fine with 2xx.
        if !is_buggregator {
            if let Some(responses) = body["responses"].as_array() {
                for item in responses {
                    let code = item["respose-code"]
                        .as_str()
                        .or_else(|| item["response-code"].as_str())
                        .unwrap_or("200");
                    if code != "200" {
                        let desc = item["response-description"]
                            .as_str()
                            .unwrap_or("unknown error");
                        tracing::error!(
                            response_code = code,
                            description = desc,
                            "SMS gateway reported failure"
                        );
                        return Err(DomainError::Repository(anyhow::anyhow!(
                            "SMS gateway rejected: {desc}"
                        )));
                    }
                }
            }
        }

        tracing::info!(to = %sms.to_msisdn, base_url = %self.config.base_url, "SMS sent successfully");
        Ok(())
    }
}
