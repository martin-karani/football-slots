use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::router::AppState;
use crate::domain::models::{
    errors::DomainError,
    rng::ProvablyFair,
    wallet::{GambleChoice, PlaceBetRequest},
};
use crate::domain::services::wallet_service::WalletService;

#[derive(Serialize)]
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
    pub bonus_claimed: bool,
    #[serde(default)]
    pub bonus_progress_current: i32,
    #[serde(default)]
    pub bonus_progress_target: i32,
}

#[axum::debug_handler]
pub async fn spin(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<SpinResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;
    let body: PlaceBetRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)
        .and_then(|bytes| serde_json::from_slice(&bytes).map_err(|_| StatusCode::BAD_REQUEST))?;

    // KYC check for real money
    if body.currency.is_real_money() {
        let user = state
            .user_repo
            .find_by_id(claims.sub)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::NOT_FOUND)?;

        if user.kyc_status != crate::domain::models::user::KycStatus::Verified {
            return Err(StatusCode::FORBIDDEN);
        }

        user.can_play_real_money(chrono::Utc::now())
            .map_err(|e| match e {
                DomainError::KycRequired => StatusCode::FORBIDDEN,
                DomainError::SelfExcluded(_) => StatusCode::FORBIDDEN,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            })?;
    }

    // Get wallet ID
    let wallet_id = state
        .wallet_service
        .get_wallet(claims.sub, body.currency)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Execute spin
    let result = state
        .game_engine
        .spin(claims.sub, wallet_id, &body)
        .await
        .map_err(|e| match e {
            DomainError::InsufficientBalance => StatusCode::PAYMENT_REQUIRED,
            DomainError::NoBetsPlaced => StatusCode::BAD_REQUEST,
            DomainError::InvalidStake(_) => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        })?;

    Ok(Json(SpinResponse {
        round_id: result.round_id,
        position: result.position,
        symbol: result.symbol,
        symbol_display: result.symbol_display,
        multiplier: result.multiplier,
        total_stake: result.total_stake,
        gross_payout: result.gross_payout,
        net_result: result.net_result,
        is_win: result.is_win,
        server_seed_hash: result.server_seed_hash,
        client_seed: result.client_seed,
        nonce: result.nonce,
        bonus_claimed: result.bonus_claimed,
        bonus_progress_current: result.bonus_progress_current,
        bonus_progress_target: result.bonus_progress_target,
    }))
}

#[derive(Deserialize)]
pub struct GambleRequest {
    pub game_round_id: Uuid,
    pub choice: GambleChoice,
    pub client_seed: Option<String>,
}

#[derive(Serialize)]
pub struct GambleResponse {
    pub game_round_id: Uuid,
    pub stake_minor: i64,
    pub choice: String,
    pub result_number: u8,
    pub won: bool,
    pub payout_minor: i64,
    pub net_result_minor: i64,
    pub server_seed_hash: String,
    pub nonce: i64,
}

#[axum::debug_handler]
pub async fn gamble(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<GambleResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;
    let body: GambleRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)
        .and_then(|bytes| serde_json::from_slice(&bytes).map_err(|_| StatusCode::BAD_REQUEST))?;

    let client_seed = body
        .client_seed
        .unwrap_or_else(|| crate::domain::models::rng::generate_client_seed());

    // Find the round to get its currency
    let round = state
        .game_repo
        .find_round_by_id(body.game_round_id)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let wallet_id = state
        .wallet_service
        .get_wallet(claims.sub, round.currency)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result = state
        .game_engine
        .gamble(
            claims.sub,
            wallet_id,
            body.game_round_id,
            body.choice,
            client_seed,
        )
        .await
        .map_err(|e| match e {
            DomainError::GambleAlreadyUsed => StatusCode::CONFLICT,
            DomainError::GambleRequiresWin => StatusCode::BAD_REQUEST,
            DomainError::UserNotFound => StatusCode::NOT_FOUND,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        })?;

    Ok(Json(GambleResponse {
        game_round_id: result.game_round_id,
        stake_minor: result.stake_minor,
        choice: result.choice,
        result_number: result.result_number,
        won: result.won,
        payout_minor: result.payout_minor,
        net_result_minor: result.net_result_minor,
        server_seed_hash: result.server_seed_hash,
        nonce: result.nonce,
    }))
}

#[derive(Serialize)]
pub struct HistoryResponse {
    pub rounds: Vec<crate::domain::models::game::GameRound>,
    pub total: i64,
}

#[axum::debug_handler]
pub async fn history(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<HistoryResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let rounds = state
        .game_repo
        .find_rounds_by_user(claims.sub, 50, 0)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total = rounds.len() as i64;
    Ok(Json(HistoryResponse { total, rounds }))
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    pub server_seed: String,
    pub client_seed: String,
    pub nonce: i64,
    pub expected_position: u8,
}

#[derive(Serialize)]
pub struct VerifyResponse {
    pub valid: bool,
    pub derived_position: u8,
}

pub async fn verify(
    State(state): State<Arc<AppState>>,
    Json(req): Json<VerifyRequest>,
) -> Json<VerifyResponse> {
    let derived = state
        .rng
        .generate_position(&req.server_seed, &req.client_seed, req.nonce);

    Json(VerifyResponse {
        valid: derived == req.expected_position,
        derived_position: derived,
    })
}

#[derive(Serialize)]
pub struct RevealSeedResponse {
    pub seed: String,
    pub round_id: Uuid,
}

#[axum::debug_handler]
pub async fn reveal_seed(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<RevealSeedResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let round = state
        .game_repo
        .find_oldest_unrevealed_round(claims.sub)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let seed_to_reveal = round.server_seed_hash.clone();

    state
        .game_repo
        .reveal_server_seed(round.id, &seed_to_reveal)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(RevealSeedResponse {
        seed: seed_to_reveal,
        round_id: round.id,
    }))
}
