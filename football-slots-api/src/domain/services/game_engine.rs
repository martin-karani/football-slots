use std::collections::HashMap;
use std::sync::Arc;

use uuid::Uuid;

use crate::domain::models::{
    errors::{DomainError, DomainResult},
    game::{Symbol, Wheel, CURRENT_PAYTABLE_VERSION, MAX_PAYOUT_MINOR},
    wallet::{CurrencyType, LedgerEntryType, PlaceBetRequest},
};
use crate::domain::services::weighted_rng::WeightedRng;
use crate::ports::repositories::{GameRepository, WalletRepository};

pub struct GameEngineImpl {
    game_repo: Arc<dyn GameRepository>,
    wallet_repo: Arc<dyn WalletRepository>,
}

impl GameEngineImpl {
    pub fn new(game_repo: Arc<dyn GameRepository>, wallet_repo: Arc<dyn WalletRepository>) -> Self {
        Self {
            game_repo,
            wallet_repo,
        }
    }

    pub async fn spin(
        &self,
        user_id: Uuid,
        wallet_id: Uuid,
        req: &PlaceBetRequest,
        config: &crate::config::Config,
    ) -> DomainResult<SpinResponse> {
        let bets = Self::validate_bets(&req.bets)?;
        let total_stake: i64 = bets.values().sum();

        if total_stake <= 0 {
            return Err(DomainError::NoBetsPlaced);
        }

        // Enforce stake limits based on currency
        let (min_stake, max_stake) = if req.currency.is_real_money() {
            (config.real_min_stake, config.real_max_stake)
        } else {
            (config.virtual_min_stake, config.virtual_max_stake)
        };

        if total_stake < min_stake {
            return Err(DomainError::InvalidStake(format!(
                "Minimum stake is {} minor units",
                min_stake
            )));
        }
        if total_stake > max_stake {
            return Err(DomainError::InvalidStake(format!(
                "Maximum stake is {} minor units",
                max_stake
            )));
        }

        let client_seed = if req.client_seed.is_empty() {
            crate::domain::models::rng::generate_client_seed()
        } else {
            req.client_seed.clone()
        };

        let mut attempts = 0;
        let (saved_round, gross_payout) = loop {
            let (server_seed, server_seed_hash, nonce) =
                self.game_repo.get_active_server_seed(user_id).await?;

            // The winning SYMBOL (and its multiplier) is now decided by the
            // weighted, provably-fair draw -- not by a uniform 1-of-24
            // position. `position` below is derived FROM the symbol purely
            // to tell the frontend which wheel cell to animate to.
            //
            // The 24-position wheel has exactly 3 copies of each symbol.
            // `draw.position_variant` (deterministic, derived from a second
            // disjoint slice of the same HMAC digest used for the symbol
            // draw, in range 0..3) tells us which copy to land on, so the
            // animation cycles naturally through all 3 occurrences instead
            // of always pinning to the first one.
            let draw = WeightedRng::generate_symbol(
                &server_seed,
                &client_seed,
                nonce,
                CURRENT_PAYTABLE_VERSION,
            );
            let positions = Wheel::positions_for_symbol(draw.symbol);
            let position = *positions
                .get(draw.position_variant as usize)
                .or_else(|| positions.first())
                .expect("every symbol has at least one wheel position");

            let bet_on_symbol = bets.get(draw.symbol.name()).copied().unwrap_or(0);
            let mut gross_payout = bet_on_symbol * draw.multiplier as i64;
            if gross_payout > MAX_PAYOUT_MINOR {
                gross_payout = MAX_PAYOUT_MINOR;
            }
            let net_result = gross_payout - total_stake;
            let is_win = gross_payout > 0;

            let round = crate::domain::models::game::GameRound {
                id: Uuid::new_v4(),
                user_id,
                currency: req.currency,
                total_stake_minor: total_stake,
                bets: serde_json::to_value(&bets).unwrap_or_default(),
                result_position: position as i16,
                result_symbol: draw.symbol.name().to_string(),
                result_multiplier: draw.multiplier as i16,
                gross_payout_minor: gross_payout,
                net_result_minor: net_result,
                is_win,
                server_seed_hash: server_seed_hash.clone(),
                server_seed: None,
                client_seed: client_seed.clone(),
                nonce,
                created_at: chrono::Utc::now(),
                paytable_version: CURRENT_PAYTABLE_VERSION,
            };

            match self.game_repo.create_round(&round).await {
                Ok(saved_round) => break (saved_round, gross_payout),
                Err(DomainError::Database(sqlx::Error::Database(ref db_err)))
                    if attempts < 10 && db_err.is_unique_violation() =>
                {
                    attempts += 1;
                    tokio::time::sleep(tokio::time::Duration::from_millis(25 * attempts as u64)).await;
                    continue;
                }
                Err(e) => return Err(e),
            }
        };

        self.wallet_repo
            .settle_atomic(
                wallet_id,
                Some((total_stake, LedgerEntryType::Bet)),
                (gross_payout > 0).then_some((gross_payout, LedgerEntryType::Win)),
                Some("game_round".to_string()),
                Some(saved_round.id),
                None,
            )
            .await?;

        let mut progress = self.game_repo.increment_bonus_progress(user_id, 1).await?;
        let mut bonus_claimed = false;

        if progress.current_value >= progress.target_value {
            let bonus_wallet = self
                .wallet_repo
                .get_or_create(user_id, CurrencyType::Bonus)
                .await?;
            self.wallet_repo
                .credit(
                    bonus_wallet.id,
                    5000,
                    LedgerEntryType::BonusCredit,
                    Some("bonus_meter".to_string()),
                    None,
                    None,
                )
                .await?;

            progress = self.game_repo.reset_bonus_progress(user_id).await?;
            bonus_claimed = true;
        }

        let response_position = saved_round.result_position as u8;
        let response_multiplier = saved_round.result_multiplier as u16;

        Ok(SpinResponse {
            round_id: saved_round.id,
            position: response_position,
            symbol: saved_round.result_symbol.clone(),
            symbol_display: Symbol::from_name(&saved_round.result_symbol)
                .map(|s| s.display_name().to_string())
                .unwrap_or_else(|| saved_round.result_symbol.clone()),
            multiplier: response_multiplier,
            total_stake: saved_round.total_stake_minor,
            gross_payout: saved_round.gross_payout_minor,
            net_result: saved_round.net_result_minor,
            is_win: saved_round.is_win,
            server_seed_hash: saved_round.server_seed_hash.clone(),
            client_seed: saved_round.client_seed.clone(),
            nonce: saved_round.nonce,
            paytable_version: saved_round.paytable_version,
            bonus_claimed,
            bonus_progress_current: progress.current_value,
            bonus_progress_target: progress.target_value,
        })
    }

    fn validate_bets(raw_bets: &HashMap<String, i64>) -> DomainResult<HashMap<String, i64>> {
        let mut bets = HashMap::new();

        for (symbol_name, amount) in raw_bets {
            if *amount <= 0 {
                return Err(DomainError::InvalidStake(format!(
                    "Bet on {} must be positive",
                    symbol_name
                )));
            }

            let valid = crate::domain::models::game::Symbol::all()
                .iter()
                .any(|s| s.name() == symbol_name);

            if !valid {
                return Err(DomainError::InvalidStake(format!(
                    "Unknown symbol: {}",
                    symbol_name
                )));
            }

            bets.insert(symbol_name.clone(), *amount);
        }

        Ok(bets)
    }
}

#[derive(Debug, serde::Serialize)]
pub struct SpinResponse {
    pub round_id: Uuid,
    pub position: u8,
    pub symbol: String,
    pub symbol_display: String,
    pub multiplier: u16,
    pub total_stake: i64,
    pub gross_payout: i64,
    pub net_result: i64,
    pub is_win: bool,
    pub server_seed_hash: String,
    pub client_seed: String,
    pub nonce: i64,
    #[serde(default)]
    pub paytable_version: i16,
    #[serde(default)]
    pub bonus_claimed: bool,
    #[serde(default)]
    pub bonus_progress_current: i32,
    #[serde(default)]
    pub bonus_progress_target: i32,
}
