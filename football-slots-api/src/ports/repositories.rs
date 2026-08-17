use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::models::{
    errors::DomainResult,
    game::GameRound,
    payment::{MpesaBalanceQuery, PaymentTransaction, ProviderInfo, UnmatchedDeposit},
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

    // ── OTP ──
    /// Store a hashed OTP code for the given phone number.
    /// Old unexpired codes for the same phone are marked as used (invalidated).
    async fn store_otp(
        &self,
        phone: &str,
        code_hash: &str,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> DomainResult<()>;

    /// Verify a plaintext OTP code against the stored hash and mark it as used.
    /// Returns `true` if the code is valid and unexpired.
    async fn verify_and_consume_otp(&self, phone: &str, code: &str) -> DomainResult<bool>;
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
    async fn find_seed_by_hash(
        &self,
        user_id: Uuid,
        seed_hash: &str,
    ) -> DomainResult<Option<String>>;
}

// ============================================================
// Payment Repository — provider-agnostic
// ============================================================

/// Outcome of an atomic settlement operation.
#[derive(Debug)]
pub enum SettlementOutcome {
    /// The settlement was applied: status updated, wallet mutated, ledger written.
    Applied {
        payment_id: Uuid,
        user_id: Uuid,
        amount_minor: i64,
    },
    /// Duplicate/stale callback; no money moved. Benign.
    AlreadySettled,
    /// Transition not allowed from the current state (e.g. callback against a
    /// non-processing withdrawal). Investigate; do not apply.
    InvalidState,
}

#[async_trait]
pub trait PaymentRepository: Send + Sync {
    // registry
    async fn list_enabled_providers(&self) -> DomainResult<Vec<ProviderInfo>>;

    // creation & lookup
    async fn find_by_idempotency_key(
        &self,
        user_id: Uuid,
        key: &str,
    ) -> DomainResult<Option<PaymentTransaction>>;
    async fn create_deposit_pending(
        &self,
        tx: &PaymentTransaction,
    ) -> DomainResult<PaymentTransaction>;

    /// FIX #2: INSERT the withdrawal row (status='processing') AND debit the
    /// wallet AND write the ledger entry in ONE transaction. The in-flight
    /// partial unique index guards concurrency; the balance guard prevents
    /// overdraft. On insufficient balance the whole transaction rolls back and
    /// NO payment row is created.
    async fn create_withdrawal_and_hold(
        &self,
        tx: &PaymentTransaction,
    ) -> DomainResult<PaymentTransaction>;

    async fn find_by_checkout_id(
        &self,
        provider: &str,
        checkout_id: &str,
    ) -> DomainResult<Option<PaymentTransaction>>;
    async fn find_by_conversation_id(
        &self,
        provider: &str,
        conversation_id: &str,
    ) -> DomainResult<Option<PaymentTransaction>>;
    async fn find_by_receipt(
        &self,
        provider: &str,
        receipt: &str,
    ) -> DomainResult<Option<PaymentTransaction>>;
    async fn find_by_id(&self, id: Uuid) -> DomainResult<Option<PaymentTransaction>>;
    async fn find_by_user(
        &self,
        user_id: Uuid,
        limit: i64,
    ) -> DomainResult<Vec<PaymentTransaction>>;
    async fn set_provider_checkout_ids(
        &self,
        id: Uuid,
        checkout_id: Option<String>,
        merchant_id: Option<String>,
    ) -> DomainResult<()>;

    // ── ATOMIC SETTLEMENT (each = ONE DB transaction) ─────────────────────

    /// Deposit transitions pending → completed only.
    async fn complete_checkout_deposit(
        &self,
        payment_id: Uuid,
        receipt: Option<String>,
        result_code: Option<i32>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome>;

    /// Manual/unsolicited deposit: INSERT payment(completed) + credit wallet +
    /// ledger, atomically. Provider amount is authoritative. Duplicate receipt
    /// ⇒ AlreadySettled (unique constraint).
    async fn complete_manual_deposit(
        &self,
        user_id: Uuid,
        provider: &str,
        amount_minor: i64,
        currency: &str,
        receipt: &str,
        reference: Option<&str>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome>;

    /// Deposit failure: pending → failed, no money movement.
    async fn fail_deposit(
        &self,
        payment_id: Uuid,
        result_code: Option<i32>,
        result_desc: Option<String>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome>;

    /// Withdrawal callbacks transition ONLY processing → completed.
    async fn complete_withdrawal(
        &self,
        payment_id: Uuid,
        receipt: Option<String>,
        result_code: Option<i32>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome>;

    /// processing → reversed AND credit wallet back + ledger, atomically.
    async fn reverse_withdrawal(
        &self,
        payment_id: Uuid,
        result_code: Option<i32>,
        result_desc: Option<String>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome>;

    // webhook event log
    async fn record_webhook_event(
        &self,
        provider: &str,
        webhook: &str,
        payload: serde_json::Value,
    ) -> DomainResult<Uuid>;
    async fn update_webhook_event(
        &self,
        event_id: Uuid,
        payment_transaction_id: Option<Uuid>,
        external_event_id: Option<String>,
        event_type: Option<String>,
        processing_status: &str,
        processing_error: Option<String>,
    ) -> DomainResult<()>;

    // quarantine
    async fn record_unmatched_deposit(
        &self,
        provider: &str,
        receipt: &str,
        reference: Option<&str>,
        masked_msisdn: Option<&str>,
        currency: &str,
        amount_minor: i64,
        raw_callback: serde_json::Value,
    ) -> DomainResult<bool>;
    async fn list_unmatched_deposits(
        &self,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<UnmatchedDeposit>>;
    async fn resolve_unmatched_deposit(
        &self,
        deposit_id: Uuid,
        user_id: Uuid,
    ) -> DomainResult<UnmatchedDeposit>;

    fn pool(&self) -> sqlx::PgPool;
}

/// M-Pesa-only operational tables (float monitoring). Kept separate so the
/// generic gateway never knows about provider-specific features.
#[async_trait]
pub trait MpesaOpsRepository: Send + Sync {
    async fn create_balance_query(&self, originator_id: &str) -> DomainResult<MpesaBalanceQuery>;
    async fn update_balance_result(
        &self,
        originator_id: &str,
        status: &str,
        working: Option<i64>,
        utility: Option<i64>,
        merchant: Option<i64>,
        charges: Option<i64>,
        raw: Option<serde_json::Value>,
    ) -> DomainResult<()>;
    async fn get_latest_balance(&self) -> DomainResult<Option<MpesaBalanceQuery>>;
}
