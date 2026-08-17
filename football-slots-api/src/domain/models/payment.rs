use chrono::DateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Provider enum for adapter dispatch. DB stores TEXT codes; the registry
/// controls availability. Adding a provider = new enum variant + DB seed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentProvider {
    Mpesa,
    // AirtelMoney, // add when implemented
}

impl PaymentProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Mpesa => "mpesa",
        }
    }

    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "mpesa" => Some(Self::Mpesa),
            _ => None,
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Mpesa => "M-Pesa",
        }
    }
}

/// Unified payment transaction row. Provider/direction/status are TEXT so
/// adding providers or states never requires ALTER TYPE.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentTransaction {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub direction: String,
    pub status: String,
    pub currency: String,
    pub amount_minor: i64,
    pub phone_number: String,
    pub client_idempotency_key: Option<String>,
    pub request_fingerprint: Option<String>,
    pub provider_checkout_id: Option<String>,
    pub provider_merchant_id: Option<String>,
    pub provider_receipt: Option<String>,
    pub provider_conversation_id: Option<String>,
    pub provider_reference: Option<String>,
    pub result_code: Option<i32>,
    pub result_desc: Option<String>,
    pub raw_callback: Option<serde_json::Value>,
    pub created_at: DateTime<chrono::Utc>,
    pub updated_at: DateTime<chrono::Utc>,
}

/// Provider info from the registry table.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProviderInfo {
    pub code: String,
    pub display_name: String,
    pub enabled: bool,
    pub supports_deposit: bool,
    pub supports_withdrawal: bool,
}

/// Quarantined deposit that couldn't be matched to a user.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UnmatchedDeposit {
    pub id: Uuid,
    pub provider: String,
    pub provider_receipt: String,
    pub provider_reference: Option<String>,
    pub masked_msisdn: Option<String>,
    pub currency: String,
    pub amount_minor: i64,
    pub raw_callback: Option<serde_json::Value>,
    pub status: String,
    pub resolved_user_id: Option<Uuid>,
    pub resolved_at: Option<DateTime<chrono::Utc>>,
    pub created_at: DateTime<chrono::Utc>,
}

/// M-Pesa-only operational model for float monitoring.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MpesaBalanceQuery {
    pub id: Uuid,
    pub originator_conversation_id: String,
    pub status: String,
    pub working_account_minor: Option<i64>,
    pub utility_account_minor: Option<i64>,
    pub merchant_account_minor: Option<i64>,
    pub charges_paid_account_minor: Option<i64>,
    pub raw_callback: Option<serde_json::Value>,
    pub created_at: DateTime<chrono::Utc>,
    pub updated_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct PaymentDepositRequest {
    pub provider: String,
    pub phone_number: String,
    pub amount_minor: i64,
}

#[derive(Debug, Deserialize)]
pub struct PaymentWithdrawRequest {
    pub provider: String,
    pub phone_number: String,
    pub amount_minor: i64,
}
