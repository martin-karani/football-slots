use async_trait::async_trait;

use uuid::Uuid;

use crate::domain::models::{
    errors::DomainResult,
    game::GameRound,
    mpesa::{MpesaAccountBalanceQuery, MpesaTransaction, TransactionStatus, UnmatchedC2bDeposit},
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

    /// Net amount withdrawn today (holds minus any same-currency reversals).
    /// A withdrawal that fails and gets reversed doesn't burn the daily quota.
    async fn get_today_withdrawals(&self, user_id: Uuid) -> DomainResult<i64>;

    /// Expose the underlying DB pool for raw reconciliation queries.
    /// Only used by the admin reconciliation endpoint.
    fn pool(&self) -> sqlx::PgPool;

    /// Freeze a wallet: blocks all debits (bets, withdrawals) but allows credits.
    async fn freeze_wallet(&self, wallet_id: Uuid) -> DomainResult<Wallet>;

    /// Unfreeze a wallet: restores normal operation.
    async fn unfreeze_wallet(&self, wallet_id: Uuid) -> DomainResult<Wallet>;
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

    /// Get the active server seed for a user, or generate a new one.
    /// Returns (seed, seed_hash, nonce).
    async fn get_active_server_seed(&self, user_id: Uuid) -> DomainResult<(String, String, i64)>;

    /// Look up the actual server seed by its hash (for reveal endpoint).
    async fn find_seed_by_hash(&self, user_id: Uuid, seed_hash: &str) -> DomainResult<Option<String>>;
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

    async fn update_provider_ids(
        &self,
        id: Uuid,
        checkout_request_id: Option<String>,
        merchant_request_id: Option<String>,
    ) -> DomainResult<MpesaTransaction>;

    async fn find_pending_by_user(&self, user_id: Uuid) -> DomainResult<Vec<MpesaTransaction>>;

    /// Atomically returns the existing OriginatorConversationID for this
    /// withdrawal if one was already minted, or generates and persists a new
    /// one if not. Safe to call concurrently for the same tx_id.
    async fn get_or_create_originator_conversation_id(&self, tx_id: Uuid) -> DomainResult<String>;

    /// Marks a withdrawal as accepted by Safaricom (ResponseCode 0).
    /// Guarded by originator_conversation_id so a stale caller can't flip a
    /// different attempt's status.
    async fn mark_transaction_submitted(
        &self,
        tx_id: Uuid,
        originator_conversation_id: &str,
    ) -> DomainResult<()>;

    /// Find a transaction by its OriginatorConversationID (B2C v3 idempotency).
    async fn find_by_originator_conversation_id(
        &self,
        originator_id: &str,
    ) -> DomainResult<Option<MpesaTransaction>>;

    // --- Account Balance API ---

    async fn create_account_balance_query(&self, originator_id: &str) -> DomainResult<MpesaAccountBalanceQuery>;

    async fn update_account_balance_result(
        &self,
        originator_id: &str,
        status: &str,
        working: Option<i64>,
        utility: Option<i64>,
        merchant: Option<i64>,
        charges: Option<i64>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<MpesaAccountBalanceQuery>;

    async fn get_latest_account_balance(&self) -> DomainResult<Option<MpesaAccountBalanceQuery>>;

    // --- Unmatched C2B Deposits ---

    /// Records a C2B payment that couldn't be matched to a user account.
    /// Returns `true` if this created a new row, `false` if already quarantined.
    async fn record_unmatched_c2b_deposit(
        &self,
        mpesa_receipt_number: &str,
        bill_ref_number: &str,
        masked_msisdn: &str,
        amount_minor: i64,
        raw_callback: serde_json::Value,
    ) -> DomainResult<bool>;

    /// List unresolved unmatched deposits.
    async fn list_unmatched_deposits(&self, limit: i64, offset: i64) -> DomainResult<Vec<UnmatchedC2bDeposit>>;

    /// Resolve an unmatched deposit by crediting a user's wallet.
    async fn resolve_unmatched_deposit(
        &self,
        deposit_id: Uuid,
        user_id: Uuid,
    ) -> DomainResult<UnmatchedC2bDeposit>;
}

