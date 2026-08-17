use async_trait::async_trait;

use crate::domain::models::errors::DomainResult;

// ── Email ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OutboundEmail {
    pub to: String,
    pub subject: String,
    pub html_body: String,
    pub text_body: Option<String>,
}

#[async_trait]
pub trait EmailGatewayPort: Send + Sync {
    async fn send_email(&self, email: OutboundEmail) -> DomainResult<()>;
}

// ── SMS ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct OutboundSms {
    pub to_msisdn: String,   // e.g. "254712345678"
    pub message: String,
}

#[async_trait]
pub trait SmsGatewayPort: Send + Sync {
    async fn send_sms(&self, sms: OutboundSms) -> DomainResult<()>;
}
