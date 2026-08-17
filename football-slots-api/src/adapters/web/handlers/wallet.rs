use axum::{
    extract::{Query, State},
    http::Request,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::adapters::web::errors::{AppResult, require_claims};
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

pub async fn balance(
    State(state): State<Arc<AppState>>,
    Query(query): Query<BalanceQuery>,
    req: Request<axum::body::Body>,
) -> AppResult<Json<BalanceResponse>> {
    let claims = require_claims(&req)?;

    let balance = state
        .wallet_service
        .get_balance(claims.sub, query.currency)
        .await?;

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

pub async fn ledger(
    State(state): State<Arc<AppState>>,
    Query(query): Query<LedgerQuery>,
    req: Request<axum::body::Body>,
) -> AppResult<Json<LedgerResponse>> {
    let claims = require_claims(&req)?;

    let wallet_id = state
        .wallet_service
        .get_wallet(claims.sub, query.currency)
        .await?;

    let entries = state
        .wallet_service
        .get_ledger_entries(wallet_id, query.limit.unwrap_or(20), query.offset.unwrap_or(0))
        .await?;

    let total = entries.len() as i64;
    Ok(Json(LedgerResponse { entries, total }))
}

pub async fn topup_virtual(
    State(state): State<Arc<AppState>>,
    req: Request<axum::body::Body>,
) -> AppResult<Json<BalanceResponse>> {
    let claims = require_claims(&req)?;

    let wallet = state
        .wallet_service
        .topup_virtual(claims.sub)
        .await?;

    Ok(Json(BalanceResponse {
        currency: CurrencyType::Virtual,
        balance_minor: wallet.balance_minor,
        balance_formatted: format!("{:.2}", wallet.balance_minor as f64 / 100.0),
    }))
}
