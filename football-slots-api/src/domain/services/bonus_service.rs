use std::sync::Arc;
use uuid::Uuid;

use crate::config::Config;
use crate::domain::models::bonus::BonusGrant;
use crate::domain::models::errors::DomainResult;
use crate::domain::models::wallet::{CurrencyType, LedgerEntryType};
use crate::ports::repositories::{BonusRepository, GameRepository, WalletRepository};

pub struct BonusServiceImpl {
    bonus_repo: Arc<dyn BonusRepository>,
    game_repo: Arc<dyn GameRepository>,
    wallet_repo: Arc<dyn WalletRepository>,
}

impl BonusServiceImpl {
    pub fn new(
        bonus_repo: Arc<dyn BonusRepository>,
        game_repo: Arc<dyn GameRepository>,
        wallet_repo: Arc<dyn WalletRepository>,
    ) -> Self {
        Self { bonus_repo, game_repo, wallet_repo }
    }

    /// Forfeit remaining bonus balance when a grant expires.
    /// This prevents orphaned bonus balance that can never be converted.
    async fn forfeit_expired_grant(&self, grant: &BonusGrant) -> DomainResult<()> {
        self.bonus_repo.mark_expired(grant.id).await?;
        let remaining = self
            .wallet_repo
            .get_balance(grant.user_id, CurrencyType::Bonus)
            .await?;
        if remaining > 0 {
            let bonus_wallet = self
                .wallet_repo
                .get_or_create(grant.user_id, CurrencyType::Bonus)
                .await?;
            self.wallet_repo
                .debit(
                    bonus_wallet.id,
                    remaining,
                    LedgerEntryType::BonusExpiry,
                    Some("bonus_grant".to_string()),
                    Some(grant.id),
                    None,
                )
                .await?;
        }
        Ok(())
    }

    /// Called after a successful REAL-money spin.
    /// Increments meter, grants bonus if target reached.
    /// Returns (bonus_claimed, current_progress, target_progress).
    pub async fn after_real_spin(
        &self,
        user_id: Uuid,
        config: &Config,
    ) -> DomainResult<(bool, i32, i32)> {
        if !config.bonus_meter_enabled {
            let progress = self.game_repo.get_or_create_bonus_progress(user_id).await?;
            return Ok((false, progress.current_value, progress.target_value));
        }

        // If user has an active grant, pause the meter
        let active_grant = self.bonus_repo.find_active_grant(user_id).await?;
        if active_grant.is_some() {
            let progress = self.game_repo.get_or_create_bonus_progress(user_id).await?;
            return Ok((false, progress.current_value, progress.target_value));
        }

        // Check daily cap
        let granted_today = self.bonus_repo.count_today_grants(user_id).await?;
        if granted_today >= config.bonus_max_daily_grants_per_user {
            let progress = self.game_repo.get_or_create_bonus_progress(user_id).await?;
            return Ok((false, progress.current_value, progress.target_value));
        }

        // Increment progress
        let progress = self.game_repo.increment_bonus_progress(user_id, 1).await?;

        // Check if target reached
        if progress.current_value >= progress.target_value {
            if config.bonus_meter_shadow {
                // Shadow mode: log but don't credit
                tracing::info!(
                    "[BONUS_SHADOW] user={} meter_full reward={} wager_required={}",
                    user_id,
                    config.bonus_meter_reward_minor,
                    config.bonus_meter_reward_minor * config.bonus_meter_wager_multiplier as i64
                );
                return Ok((false, progress.current_value, progress.target_value));
            }

            // Grant the bonus
            let grant = self.bonus_repo.create_grant(
                user_id,
                config.bonus_meter_reward_minor,
                config.bonus_meter_wager_multiplier,
                config.bonus_grant_expiry_hours,
            ).await?;

            // Credit bonus wallet
            let bonus_wallet = self.wallet_repo
                .get_or_create(user_id, CurrencyType::Bonus)
                .await?;

            self.wallet_repo.credit(
                bonus_wallet.id,
                config.bonus_meter_reward_minor,
                LedgerEntryType::BonusCredit,
                Some("bonus_meter".to_string()),
                Some(grant.id),
                Some(serde_json::json!({
                    "wager_multiplier": config.bonus_meter_wager_multiplier,
                    "wager_required": grant.wager_required_minor,
                })),
            ).await?;

            // Reset meter
            let reset_progress = self.game_repo.reset_bonus_progress(user_id).await?;

            return Ok((true, reset_progress.current_value, reset_progress.target_value));
        }

        Ok((false, progress.current_value, progress.target_value))
    }

    /// Called after a successful BONUS-currency spin.
    /// Tracks wagering, handles completion/loss.
    /// Returns (grant_completed, grant_lost, converted_amount).
    pub async fn after_bonus_spin(
        &self,
        user_id: Uuid,
        total_stake: i64,
        _config: &Config,
    ) -> DomainResult<(bool, bool, i64)> {
        let grant = match self.bonus_repo.find_active_grant(user_id).await? {
            Some(g) => g,
            None => return Ok((false, false, 0)),
        };

        // Check expiry
        if grant.is_expired() {
            self.forfeit_expired_grant(&grant).await?;
            return Ok((false, false, 0));
        }

        // Increment wagered
        let updated_grant = self.bonus_repo.increment_wagered(grant.id, total_stake).await?;

        // Check if wagering complete
        if updated_grant.is_wagering_complete() {
            self.bonus_repo.mark_completed(updated_grant.id).await?;

            // Convert remaining bonus balance to real
            let bonus_balance = self.wallet_repo
                .get_balance(user_id, CurrencyType::Bonus)
                .await?;

            if bonus_balance > 0 {
                let bonus_wallet = self.wallet_repo
                    .get_or_create(user_id, CurrencyType::Bonus)
                    .await?;
                let real_wallet = self.wallet_repo
                    .get_or_create(user_id, CurrencyType::Real)
                    .await?;

                // Debit bonus
                self.wallet_repo.debit(
                    bonus_wallet.id,
                    bonus_balance,
                    LedgerEntryType::BonusConversion,
                    Some("bonus_grant".to_string()),
                    Some(updated_grant.id),
                    None,
                ).await?;

                // Credit real
                self.wallet_repo.credit(
                    real_wallet.id,
                    bonus_balance,
                    LedgerEntryType::BonusConversion,
                    Some("bonus_grant".to_string()),
                    Some(updated_grant.id),
                    None,
                ).await?;

                return Ok((true, false, bonus_balance));
            }

            return Ok((true, false, 0));
        }

        // Check if bonus balance is zero (lost)
        let bonus_balance = self.wallet_repo
            .get_balance(user_id, CurrencyType::Bonus)
            .await?;

        if bonus_balance <= 0 {
            self.bonus_repo.mark_lost(updated_grant.id).await?;
            return Ok((false, true, 0));
        }

        Ok((false, false, 0))
    }

    /// Get current bonus status for a user.
    pub async fn get_status(
        &self,
        user_id: Uuid,
        config: &Config,
    ) -> DomainResult<BonusStatusResponse> {
        let progress = self.game_repo.get_or_create_bonus_progress(user_id).await?;
        let active_grant = self.bonus_repo.find_active_grant(user_id).await?;
        let bonus_balance = self.wallet_repo
            .get_balance(user_id, CurrencyType::Bonus)
            .await?;

        // Handle expired grant lazily
        if let Some(ref grant) = active_grant {
            if grant.is_expired() {
                self.forfeit_expired_grant(grant).await?;
                return Ok(BonusStatusResponse {
                    meter_enabled: config.bonus_meter_enabled,
                    meter_current: progress.current_value,
                    meter_target: progress.target_value,
                    reward_minor: config.bonus_meter_reward_minor,
                    grant_active: false,
                    grant_wagered: 0,
                    grant_wager_required: 0,
                    grant_amount: 0,
                    bonus_balance_minor: 0,
                });
            }
        }

        Ok(BonusStatusResponse {
            meter_enabled: config.bonus_meter_enabled,
            meter_current: progress.current_value,
            meter_target: progress.target_value,
            reward_minor: config.bonus_meter_reward_minor,
            grant_active: active_grant.is_some(),
            grant_wagered: active_grant.as_ref().map(|g| g.wagered_minor).unwrap_or(0),
            grant_wager_required: active_grant.as_ref().map(|g| g.wager_required_minor).unwrap_or(0),
            grant_amount: active_grant.as_ref().map(|g| g.amount_minor).unwrap_or(0),
            bonus_balance_minor: bonus_balance,
        })
    }
}

#[derive(Debug, serde::Serialize)]
pub struct BonusStatusResponse {
    pub meter_enabled: bool,
    pub meter_current: i32,
    pub meter_target: i32,
    pub reward_minor: i64,
    pub grant_active: bool,
    pub grant_wagered: i64,
    pub grant_wager_required: i64,
    pub grant_amount: i64,
    pub bonus_balance_minor: i64,
}
