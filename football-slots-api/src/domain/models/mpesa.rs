use chrono::DateTime;
use serde::{Deserialize, Serialize};
use sqlx::Type;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum MpesaDirection {
    Deposit,
    Withdrawal,
}

impl std::fmt::Display for MpesaDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MpesaDirection::Deposit => write!(f, "deposit"),
            MpesaDirection::Withdrawal => write!(f, "withdrawal"),
        }
    }
}

/// Transaction lifecycle states.
///
/// `Submitted` is distinct from `Pending`: it means Safaricom has accepted
/// the B2C request (ResponseCode 0) and we are awaiting the async ResultURL
/// callback. This prevents the B2C send function from resubmitting a request
/// that Safaricom already accepted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum TransactionStatus {
    Pending,    // row created, not yet submitted to Safaricom
    Submitted,  // Safaricom returned ResponseCode 0; waiting on ResultURL
    Success,    // ResultURL confirmed ResultCode 0
    Failed,     // rejected at submission or by ResultURL
    Cancelled,  // user cancelled (STK Push)
}

impl std::fmt::Display for TransactionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransactionStatus::Pending => write!(f, "pending"),
            TransactionStatus::Submitted => write!(f, "submitted"),
            TransactionStatus::Success => write!(f, "success"),
            TransactionStatus::Failed => write!(f, "failed"),
            TransactionStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MpesaTransaction {
    pub id: Uuid,
    pub user_id: Uuid,
    pub direction: MpesaDirection,
    pub checkout_request_id: Option<String>,
    pub merchant_request_id: Option<String>,
    pub amount_minor: i64,
    pub phone_number: String,
    pub status: TransactionStatus,
    pub mpesa_receipt_number: Option<String>,
    pub result_code: Option<i32>,
    pub result_desc: Option<String>,
    /// B2C v3 idempotency key. Generated once per withdrawal row, reused on
    /// every retry so Safaricom can detect duplicate submissions.
    pub originator_conversation_id: Option<String>,
    /// C2B manual deposit: the BillRefNumber the customer entered when paying
    /// the Paybill. Used to resolve the recipient user account.
    pub c2b_bill_ref_number: Option<String>,
    pub raw_callback: Option<serde_json::Value>,
    pub created_at: DateTime<chrono::Utc>,
    pub updated_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct MpesaDepositRequest {
    pub phone_number: String,
    pub amount_minor: i64,
}

// ============================================================
// Account Balance Query model
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MpesaAccountBalanceQuery {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountBalanceSummary {
    pub working_account_kes: Option<f64>,
    pub utility_account_kes: Option<f64>,
    pub merchant_account_kes: Option<f64>,
    pub charges_paid_kes: Option<f64>,
    pub last_updated: DateTime<chrono::Utc>,
}

// ============================================================
// Unmatched C2B Deposit model
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UnmatchedC2bDeposit {
    pub id: Uuid,
    pub mpesa_receipt_number: String,
    pub bill_ref_number: Option<String>,
    pub masked_msisdn: Option<String>,
    pub amount_minor: i64,
    pub raw_callback: Option<serde_json::Value>,
    pub status: String,
    pub resolved_user_id: Option<Uuid>,
    pub resolved_at: Option<DateTime<chrono::Utc>>,
    pub created_at: DateTime<chrono::Utc>,
}
