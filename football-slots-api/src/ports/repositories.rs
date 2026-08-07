use async_trait::async_trait;

use uuid::Uuid;

use crate::domain::models::{
    errors::DomainResult,
    gamble::GambleRound,
    game::{BonusProgress, GameRound},
    mpesa::{MpesaTransaction, TransactionStatus},
    user::{CreateUserRequest, KycStatus, User},
    wallet::{CurrencyType, LedgerEntryType, Wallet, WalletLedgerEntry},
};

/// User repository trait.
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn create(&self, req: &CreateUserRequest) -> DomainResult<User>;
    async fn find_by_id(&self, id: Uuid) -> DomainResult<Option<User>>;
    async fn find_by_phone(&self, phone: &str) -> DomainResult<Option<User>>;
    async fn update_kyc_status(&self, id: Uuid, status: KycStatus) -> DomainResult<User>;
    async fn update_self_exclusion(
        &self,
        id: Uuid,
        until: Option<chrono::DateTime<chrono::Utc>>,
    ) -> DomainResult<User>;
    async fn get_or_create_by_phone(&self, phone: &str) -> DomainResult<User>;
}

/// Wallet repository trait.
#[async_trait]
pub trait WalletRepository: Send + Sync {
    async fn get_or_create(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<Wallet>;
    async fn find_by_id(&self, id: Uuid) -> DomainResult<Option<Wallet>>;
    async fn get_balance(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<i64>;
    async fn topup_virtual(&self, user_id: Uuid) -> DomainResult<Wallet>;

    async fn debit(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        entry_type: LedgerEntryType,
        reference_type: Option<String>,
        reference_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> DomainResult<Wallet>;

    async fn credit(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        entry_type: LedgerEntryType,
        reference_type: Option<String>,
        reference_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> DomainResult<Wallet>;

    async fn settle_atomic(
        &self,
        wallet_id: Uuid,
        debit: Option<(i64, LedgerEntryType)>,
        credit: Option<(i64, LedgerEntryType)>,
        reference_type: Option<String>,
        reference_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> DomainResult<Wallet>;

    async fn get_ledger_entries(
        &self,
        wallet_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<WalletLedgerEntry>>;

    async fn get_today_deposits(&self, user_id: Uuid) -> DomainResult<i64>;
}

/// Game repository trait.
#[async_trait]
pub trait GameRepository: Send + Sync {
    async fn create_round(&self, round: &GameRound) -> DomainResult<GameRound>;
    async fn find_round_by_id(&self, id: Uuid) -> DomainResult<Option<GameRound>>;
    async fn find_rounds_by_user(
        &self,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<GameRound>>;
    async fn reveal_server_seed(&self, round_id: Uuid, seed: &str) -> DomainResult<()>;
    async fn find_oldest_unrevealed_round(&self, user_id: Uuid) -> DomainResult<Option<GameRound>>;

    async fn create_gamble_round(&self, round: &GambleRound) -> DomainResult<GambleRound>;
    async fn find_gamble_by_game_round(
        &self,
        game_round_id: Uuid,
    ) -> DomainResult<Option<GambleRound>>;

    async fn get_or_create_bonus_progress(&self, user_id: Uuid) -> DomainResult<BonusProgress>;
    async fn increment_bonus_progress(
        &self,
        user_id: Uuid,
        amount: i32,
    ) -> DomainResult<BonusProgress>;
    async fn reset_bonus_progress(&self, user_id: Uuid) -> DomainResult<BonusProgress>;

    /// Get the active server seed for a user, or generate a new one.
    /// Returns (seed, seed_hash, nonce).
    async fn get_active_server_seed(&self, user_id: Uuid) -> DomainResult<(String, String, i64)>;
}

/// M-Pesa transaction repository trait.
#[async_trait]
pub trait MpesaRepository: Send + Sync {
    async fn create_transaction(&self, tx: &MpesaTransaction) -> DomainResult<MpesaTransaction>;
    async fn find_by_checkout_request_id(
        &self,
        checkout_id: &str,
    ) -> DomainResult<Option<MpesaTransaction>>;

    async fn update_status(
        &self,
        id: Uuid,
        status: TransactionStatus,
        receipt: Option<String>,
        result_code: Option<i32>,
        result_desc: Option<String>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<MpesaTransaction>;

    async fn update_with_merchant_request_id(
        &self,
        id: Uuid,
        merchant_request_id: Option<String>,
    ) -> DomainResult<MpesaTransaction>;

    async fn find_pending_by_user(&self, user_id: Uuid) -> DomainResult<Vec<MpesaTransaction>>;
}
