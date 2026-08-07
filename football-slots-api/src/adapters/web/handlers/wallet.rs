use axum::{
    extract::{Query, State},
    http::{Request, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::router::AppState;
use crate::domain::models::wallet::CurrencyType;
use crate::domain::services::wallet_service::WalletService;

#[derive(Deserialize)]
pub struct BalanceQuery {
    pub currency: CurrencyType,
}

#[derive(Serialize)]
pub struct BalanceResponse {
    pub currency: CurrencyType,
    pub balance_minor: i64,
    pub balance_formatted: String,
}

#[axum::debug_handler]
pub async fn balance(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BalanceQuery>,
    req: Request<axum::body::Body>,
) -> Result<Json<BalanceResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let balance = state
        .wallet_service
        .get_balance(claims.sub, query.currency)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(BalanceResponse {
        currency: query.currency,
        balance_minor: balance,
        balance_formatted: format!("{:.2}", balance as f64 / 100.0),
    }))
}

#[derive(Deserialize)]
pub struct LedgerQuery {
    pub currency: CurrencyType,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize)]
pub struct LedgerResponse {
    pub entries: Vec<crate::domain::models::wallet::WalletLedgerEntry>,
    pub total: i64,
}

#[axum::debug_handler]
pub async fn ledger(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LedgerQuery>,
    req: Request<axum::body::Body>,
) -> Result<Json<LedgerResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let wallet = state
        .wallet_repo
        .get_or_create(claims.sub, query.currency)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let entries = state
        .wallet_repo
        .get_ledger_entries(
            wallet.id,
            query.limit.unwrap_or(20),
            query.offset.unwrap_or(0),
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total = entries.len() as i64;
    Ok(Json(LedgerResponse { entries, total }))
}

#[axum::debug_handler]
pub async fn topup_virtual(
    State(state): State<Arc<AppState>>,
    req: Request<axum::body::Body>,
) -> Result<Json<BalanceResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let wallet = state
        .wallet_repo
        .topup_virtual(claims.sub)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(BalanceResponse {
        currency: CurrencyType::Virtual,
        balance_minor: wallet.balance_minor,
        balance_formatted: format!("{:.2}", wallet.balance_minor as f64 / 100.0),
    }))
}
