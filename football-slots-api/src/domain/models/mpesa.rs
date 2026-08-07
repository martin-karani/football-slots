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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "text", rename_all = "lowercase")]
pub enum TransactionStatus {
    Pending,
    Success,
    Failed,
    Cancelled,
}

impl std::fmt::Display for TransactionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransactionStatus::Pending => write!(f, "pending"),
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
    pub raw_callback: Option<serde_json::Value>,
    pub created_at: DateTime<chrono::Utc>,
    pub updated_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct MpesaDepositRequest {
    pub phone_number: String,
    pub amount_minor: i64,
}
