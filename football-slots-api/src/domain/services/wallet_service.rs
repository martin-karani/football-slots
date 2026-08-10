use std::sync::Arc;

use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::models::{
    errors::DomainResult,
    wallet::{CurrencyType, LedgerEntryType, Wallet, WalletLedgerEntry},
};
use crate::ports::repositories::WalletRepository;

#[async_trait]
pub trait WalletService: Send + Sync {
    async fn get_balance(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<i64>;
    async fn get_wallet(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<Uuid>;
    async fn get_ledger_entries(
        &self,
        wallet_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<WalletLedgerEntry>>;
    async fn topup_virtual(&self, user_id: Uuid) -> DomainResult<Wallet>;
    async fn debit_bet(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_type: String,
    ) -> DomainResult<()>;
    async fn credit_win(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_type: String,
    ) -> DomainResult<()>;
    async fn credit_bonus(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_type: String,
    ) -> DomainResult<()>;
    async fn credit_deposit(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_id: Uuid,
    ) -> DomainResult<()>;
}

pub struct WalletServiceImpl {
    wallet_repo: Arc<dyn WalletRepository>,
}

impl WalletServiceImpl {
    pub fn new(wallet_repo: Arc<dyn WalletRepository>) -> Self {
        Self { wallet_repo }
    }
}

#[async_trait]
impl WalletService for WalletServiceImpl {
    async fn get_balance(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<i64> {
        self.wallet_repo.get_balance(user_id, currency).await
    }

    async fn get_wallet(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<Uuid> {
        let wallet = self.wallet_repo.get_or_create(user_id, currency).await?;
        Ok(wallet.id)
    }

    async fn get_ledger_entries(
        &self,
        wallet_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<WalletLedgerEntry>> {
        self.wallet_repo.get_ledger_entries(wallet_id, limit, offset).await
    }

    async fn topup_virtual(&self, user_id: Uuid) -> DomainResult<Wallet> {
        self.wallet_repo.topup_virtual(user_id).await
    }

    async fn debit_bet(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_type: String,
    ) -> DomainResult<()> {
        self.wallet_repo
            .debit(
                wallet_id,
                amount_minor,
                LedgerEntryType::Bet,
                Some(reference_type),
                None,
                None,
            )
            .await?;
        Ok(())
    }

    async fn credit_win(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_type: String,
    ) -> DomainResult<()> {
        self.wallet_repo
            .credit(
                wallet_id,
                amount_minor,
                LedgerEntryType::Win,
                Some(reference_type),
                None,
                None,
            )
            .await?;
        Ok(())
    }

    async fn credit_bonus(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_type: String,
    ) -> DomainResult<()> {
        self.wallet_repo
            .credit(
                wallet_id,
                amount_minor,
                LedgerEntryType::BonusCredit,
                Some(reference_type),
                None,
                None,
            )
            .await?;
        Ok(())
    }

    async fn credit_deposit(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        reference_id: Uuid,
    ) -> DomainResult<()> {
        self.wallet_repo
            .credit(
                wallet_id,
                amount_minor,
                LedgerEntryType::Deposit,
                Some("mpesa_transaction".to_string()),
                Some(reference_id),
                None,
            )
            .await?;
        Ok(())
    }
}
