use async_trait::async_trait;
use crate::domain::models::{
    errors::DomainResult,
    payment::{PaymentProvider, PaymentTransaction},
};

#[derive(Debug)]
pub struct DepositInitiation {
    pub provider_checkout_id: Option<String>,
    pub provider_merchant_id: Option<String>,
    pub message: String,
}

#[derive(Debug)]
pub struct WithdrawalInitiation {
    pub message: String, // conversation id is minted & persisted by the gateway
}

/// Lookup types for tracing a transaction back to a provider identifier.
#[derive(Debug)]
pub enum TxLookup {
    Checkout(String),
    Conversation(String),
    Receipt(String),
}

/// Provider events extracted from raw webhooks.
#[derive(Debug)]
pub enum ProviderEvent {
    DepositSucceeded {
        lookup: TxLookup,
        user_id: Option<uuid::Uuid>,
        amount_minor: i64,
        receipt: Option<String>,
        reference: Option<String>,
        masked_msisdn: Option<String>,
        raw: serde_json::Value,
    },
    DepositFailed {
        lookup: TxLookup,
        result_code: Option<i32>,
        result_desc: Option<String>,
        raw: serde_json::Value,
    },
    WithdrawalSucceeded {
        lookup: TxLookup,
        receipt: Option<String>,
        raw: serde_json::Value,
    },
    WithdrawalFailed {
        lookup: TxLookup,
        result_code: Option<i32>,
        result_desc: Option<String>,
        raw: serde_json::Value,
    },
}

/// Outcome of submitting a request to a provider. This tri-state is REQUIRED
/// so the gateway never mistakes an ambiguous network outcome for a rejection.
#[derive(Debug)]
pub enum ProviderSubmission<T> {
    /// Provider definitively accepted the request.
    Accepted(T),
    /// Provider definitively rejected it (bad phone, insufficient float,
    /// ResponseCode != 0, etc.). Safe to fail/reverse.
    Rejected(String),
    /// Outcome unknown (timeout, connection reset, lost response after the
    /// provider may have accepted). MUST NOT be treated as failure. Leave the
    /// payment in-flight and resolve via reconciliation.
    Unknown(String),
}

#[async_trait]
pub trait PaymentProviderPort: Send + Sync {
    fn provider(&self) -> PaymentProvider;

    async fn initiate_deposit(&self, tx: &PaymentTransaction) -> ProviderSubmission<DepositInitiation>;

    /// Submit a payout. Funds are ALREADY held. tx.provider_conversation_id is
    /// pre-set by the gateway and MUST be used as the provider idempotency key.
    /// The adapter MUST NOT write payment state.
    async fn initiate_withdrawal(&self, tx: &PaymentTransaction) -> ProviderSubmission<WithdrawalInitiation>;

    /// Translate a raw webhook into a ProviderEvent. Return None for webhooks
    /// the adapter handles internally (e.g. M-Pesa Account Balance, B2B).
    async fn process_webhook(&self, webhook: &str, payload: serde_json::Value)
        -> DomainResult<Option<ProviderEvent>>;
}
