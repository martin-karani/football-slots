use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::router::AppState;
use crate::domain::models::{
    errors::DomainError,
    game::{paytable_for_version, CURRENT_PAYTABLE_VERSION, Wheel},
    wallet::PlaceBetRequest,
};
use crate::domain::services::wallet_service::WalletService;
use crate::domain::services::weighted_rng::WeightedRng;

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
    pub paytable_version: i16,
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
    if body.currency.requires_kyc() {
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
        .map_err(|e| {
            tracing::error!("Wallet lookup failed: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Execute spin
    let result = state
        .game_engine
        .spin(claims.sub, wallet_id, &body, &state.config)
        .await
        .map_err(|e| {
            let msg = e.to_string();
            tracing::error!("Spin failed: {}", msg);
            match e {
                DomainError::InsufficientBalance => StatusCode::PAYMENT_REQUIRED,
                DomainError::NoBetsPlaced => StatusCode::BAD_REQUEST,
                DomainError::InvalidStake(_) => StatusCode::BAD_REQUEST,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            }
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
        paytable_version: result.paytable_version,
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

/// `expected_symbol` + `paytable_version` should be copied verbatim from the
/// round being audited (both are returned by `/spin` and stored in
/// `/history`). Defaulting `paytable_version` to the current one is a
/// convenience for "verify my last spin right now" UIs, but any historical
/// round MUST send its own stored version, or you're checking it against
/// the wrong paytable and a genuinely fair round can come back `valid: false`.
#[derive(Deserialize)]
pub struct VerifyRequest {
    pub server_seed: String,
    pub client_seed: String,
    pub nonce: i64,
    pub expected_symbol: String,
    #[serde(default = "default_paytable_version")]
    pub paytable_version: i16,
}

fn default_paytable_version() -> i16 {
    CURRENT_PAYTABLE_VERSION
}

#[derive(Serialize)]
pub struct VerifyResponse {
    pub valid: bool,
    pub derived_symbol: String,
    pub derived_multiplier: u32,
    pub derived_position: u8,
    /// Raw HMAC-derived draw value in [0, 1) — publish this alongside the
    /// weight table so anyone can re-run the cumulative-distribution walk
    /// themselves and land on the same symbol.
    pub unit_interval: f64,
}

pub async fn verify(Json(req): Json<VerifyRequest>) -> Json<VerifyResponse> {
    let draw = WeightedRng::generate_symbol(
        &req.server_seed,
        &req.client_seed,
        req.nonce,
        req.paytable_version,
    );
    let derived_position = Wheel::get_first_position_for_symbol(draw.symbol);

    Json(VerifyResponse {
        valid: draw.symbol.name() == req.expected_symbol,
        derived_symbol: draw.symbol.name().to_string(),
        derived_multiplier: draw.multiplier,
        derived_position,
        unit_interval: draw.unit_interval,
    })
}

#[derive(Serialize)]
pub struct PaytableRow {
    pub symbol: String,
    pub display_name: String,
    pub tier: String,
    pub multiplier: u32,
    /// Win probability for this symbol, e.g. 0.19048 = 19.048%.
    pub probability: f64,
}

#[derive(Serialize)]
pub struct PaytableResponse {
    pub paytable_version: i16,
    /// Return-to-player implied by this paytable: 1 / sum(1/multiplier).
    /// Identical for every symbol's individual contribution by design — see
    /// docs/rtp-weighting.md.
    pub rtp: f64,
    pub symbols: Vec<PaytableRow>,
}

/// Public, unauthenticated: this is the "document the weighting scheme
/// publicly" endpoint. The mobile app's paytable screen should fetch real
/// odds from here instead of inferring them from wheel-cell counts (that
/// only worked back when every cell was equally likely).
pub async fn paytable() -> Json<PaytableResponse> {
    let version = CURRENT_PAYTABLE_VERSION;
    let table = paytable_for_version(version);
    let rtp = WeightedRng::implied_rtp(&table);
    let weighted = WeightedRng::weight_table(&table);

    let symbols = weighted
        .iter()
        .map(|e| PaytableRow {
            symbol: e.symbol.name().to_string(),
            display_name: e.symbol.display_name().to_string(),
            tier: e.symbol.tier().to_string(),
            multiplier: e.multiplier,
            probability: e.weight,
        })
        .collect();

    Json(PaytableResponse {
        paytable_version: version,
        rtp,
        symbols,
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

    // Fetch the actual server seed from the server_seeds table using the hash.
    // The round only stores the hash; the real seed lives in server_seeds.
    let seed_to_reveal = state
        .game_repo
        .find_seed_by_hash(claims.sub, &round.server_seed_hash)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

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