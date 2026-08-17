use async_trait::async_trait;

use crate::domain::models::errors::DomainResult;
use crate::domain::models::payment::PaymentProvider;
use crate::ports::payments::{
    DepositInitiation, PaymentProviderPort, ProviderEvent, ProviderSubmission, WithdrawalInitiation,
};

/// Airtel Money adapter stub — NOT registered in main.rs.
///
/// To enable:
/// 1. Implement the methods below
/// 2. Add `AirtelMoney` variant to `PaymentProvider` enum
/// 3. Register the adapter in `main.rs`
/// 4. `INSERT INTO payment_providers VALUES ('airtel_money', 'Airtel Money', TRUE, TRUE, TRUE);`
pub struct AirtelAdapter;

impl AirtelAdapter {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl PaymentProviderPort for AirtelAdapter {
    fn provider(&self) -> PaymentProvider {
        // This would be PaymentProvider::AirtelMoney when enabled
        PaymentProvider::Mpesa // placeholder — unreachable
    }

    async fn initiate_deposit(&self, _tx: &crate::domain::models::payment::PaymentTransaction) -> ProviderSubmission<DepositInitiation> {
        ProviderSubmission::Unknown("Airtel Money not implemented".into())
    }

    async fn initiate_withdrawal(&self, _tx: &crate::domain::models::payment::PaymentTransaction) -> ProviderSubmission<WithdrawalInitiation> {
        ProviderSubmission::Unknown("Airtel Money not implemented".into())
    }

    async fn process_webhook(&self, _webhook: &str, _payload: serde_json::Value) -> DomainResult<Option<ProviderEvent>> {
        Ok(None)
    }
}
