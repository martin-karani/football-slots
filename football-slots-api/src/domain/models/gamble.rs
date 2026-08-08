use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::wallet::GambleChoice;

/// The result of a Home/Away gamble.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GambleResult {
    pub game_round_id: Uuid,
    pub stake_minor: i64,
    pub choice: GambleChoice,
    pub result_number: u8,
    pub won: bool,
    pub payout_minor: i64,   // 0 if lost, 2*stake if won
    pub net_result_minor: i64, // payout - stake
    pub server_seed_hash: String,
    pub client_seed: String,
    pub nonce: i64,
}

/// A persisted gamble round.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GambleRound {
    pub id: Uuid,
    pub game_round_id: Uuid,
    pub user_id: Uuid,
    pub stake_minor: i64,
    pub choice: String,
    pub result_number: i16,
    pub won: bool,
    pub payout_minor: i64,
    pub net_result_minor: i64,
    pub server_seed_hash: String,
    pub server_seed: Option<String>,
    pub client_seed: String,
    pub nonce: i64,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Determine if a gamble choice wins based on the result number.
/// The RNG produces 1-24; Home wins on 1-12, Away wins on 13-24 (50/50).
pub fn evaluate_gamble(choice: GambleChoice, result_number: u8) -> bool {
    match choice {
        GambleChoice::Home => result_number >= 1 && result_number <= 12,
        GambleChoice::Away => result_number >= 13 && result_number <= 24,
    }
}
