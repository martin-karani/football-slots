use chrono::DateTime;
use serde::{Deserialize, Serialize};
use sqlx::Type;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "currency_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum CurrencyType {
    Virtual,
    Real,
    Bonus,
}

impl CurrencyType {
    pub fn is_real_money(&self) -> bool {
        matches!(self, CurrencyType::Real)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LedgerEntryType {
    Bet,
    Win,
    Deposit,
    Withdrawal,
    WithdrawalReversal, // funds given back after a failed/timed-out payout
    BonusCredit,
}

impl std::fmt::Display for LedgerEntryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LedgerEntryType::Bet => write!(f, "bet"),
            LedgerEntryType::Win => write!(f, "win"),
            LedgerEntryType::Deposit => write!(f, "deposit"),
            LedgerEntryType::Withdrawal => write!(f, "withdrawal"),
            LedgerEntryType::WithdrawalReversal => write!(f, "withdrawal_reversal"),
            LedgerEntryType::BonusCredit => write!(f, "bonus_credit"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Wallet {
    pub id: Uuid,
    pub user_id: Uuid,
    pub currency: CurrencyType,
    pub balance_minor: i64,
    pub created_at: DateTime<chrono::Utc>,
    pub updated_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct WalletLedgerEntry {
    pub id: Uuid,
    pub wallet_id: Uuid,
    pub entry_type: String,
    pub amount_minor: i64,
    pub balance_after_minor: i64,
    pub reference_type: Option<String>,
    pub reference_id: Option<Uuid>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct PlaceBetRequest {
    pub currency: CurrencyType,
    pub bets: std::collections::HashMap<String, i64>,
    pub client_seed: String,
}


