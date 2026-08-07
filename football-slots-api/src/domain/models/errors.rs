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

    #[error("the gamble feature has already been used for this round")]
    GambleAlreadyUsed,

    #[error("invalid stake: {0}")]
    InvalidStake(String),

    #[error("no bets placed")]
    NoBetsPlaced,

    #[error("payment provider error: {0}")]
    Payment(String),

    #[error("round already completed")]
    RoundAlreadyCompleted,

    #[error("only winning rounds can be gambled")]
    GambleRequiresWin,

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

    #[error("bonus already claimed")]
    BonusAlreadyClaimed,
}

pub type DomainResult<T> = Result<T, DomainError>;
