use thiserror::Error;

#[derive(Debug, Error)]
pub enum DomainError {
    #[error("insufficient balance")]
    InsufficientBalance,

    #[error("wallet not found")]
    WalletNotFound,

    #[error("user not found")]
    UserNotFound,

    #[error("real-money play requires KYC verification")]
    KycRequired,

    #[error("account is self-excluded until {0}")]
    SelfExcluded(chrono::DateTime<chrono::Utc>),

    #[error("deposit exceeds your daily limit of {limit_minor}")]
    DepositLimitExceeded { limit_minor: i64 },

    #[error("minimum withdrawal is {minimum_minor}")]
    MinimumWithdrawalNotMet { minimum_minor: i64 },

    #[error("maximum withdrawal is {maximum_minor}")]
    MaximumWithdrawalExceeded { maximum_minor: i64 },

    #[error("withdrawal exceeds your daily limit of {limit_minor}")]
    WithdrawalLimitExceeded { limit_minor: i64 },

    #[error("you already have a withdrawal in progress")]
    PendingWithdrawalExists,

    #[error("invalid stake: {0}")]
    InvalidStake(String),

    #[error("no bets placed")]
    NoBetsPlaced,

    #[error("payment provider error: {0}")]
    Payment(String),

    #[error("round already completed")]
    RoundAlreadyCompleted,

    #[error("repository error: {0}")]
    Repository(#[from] anyhow::Error),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("OTP verification failed")]
    OtpVerificationFailed,

    #[error("OTP expired")]
    OtpExpired,

    #[error("authentication required")]
    AuthenticationRequired,

    #[error("withdrawal phone must match your registered phone number")]
    WithdrawalPhoneMismatch,

    #[error("too many requests. Please wait before trying again")]
    RateLimited,

    #[error("unauthorized IP {0}. M-Pesa callbacks must come from Safaricom")]
    UnauthorizedCallbackIp(String),

    #[error("wallet reconciliation failed: balance {balance_minor} does not match ledger sum {ledger_sum}")]
    WalletReconciliationMismatch { balance_minor: i64, ledger_sum: i64 },

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("validation error: {0}")]
    Validation(String),

    #[error("payment provider '{0}' is not enabled")]
    ProviderNotEnabled(String),

    #[error("amount mismatch: provider charged {provider}, expected {expected}")]
    AmountMismatch { provider: i64, expected: i64 },

    #[error("idempotency conflict: same key used for different request parameters")]
    IdempotencyConflict,

    #[error("provider rejected: {0}")]
    ProviderRejected(String),

    #[error("provider outcome unknown: {0}")]
    ProviderOutcomeUnknown(String),
}

pub type DomainResult<T> = Result<T, DomainError>;
