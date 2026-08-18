use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::handlers::ErrorResponse;
use crate::adapters::web::router::AppState;
use crate::domain::models::wallet::WalletLedgerEntry;


/// Result of a single wallet reconciliation check.
#[derive(Serialize)]
pub struct ReconciliationResult {
    pub wallet_id: Uuid,
    pub user_id: Uuid,
    pub currency: String,
    pub balance_minor: i64,
    pub ledger_sum_minor: i64,
    pub matches: bool,
}

#[derive(Serialize)]
pub struct ReconciliationResponse {
    pub total_wallets: i64,
    pub mismatches: i64,
    pub results: Vec<ReconciliationResult>,
}

/// Reconcile all wallets against their ledger entries. Admin only.
pub async fn reconcile_wallets(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<ReconciliationResponse>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            error: "unauthorized".into(),
            message: "Admin access required".into(),
        }),
    ))?;

    let rows: Vec<(Uuid, Uuid, String, i64, i64)> = sqlx::query_as(
        r#"SELECT
               w.id AS wallet_id,
               w.user_id,
               w.currency::text,
               w.balance_minor,
               COALESCE(SUM(l.amount_minor), 0) AS ledger_sum_minor
           FROM wallets w
           LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
           GROUP BY w.id, w.user_id, w.currency, w.balance_minor"#,
    )
    .fetch_all(&state.wallet_repo.pool())
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "database_error".into(),
                message: format!("Reconciliation query failed: {}", e),
            }),
        )
    })?;

    let mut results = Vec::new();
    let mut mismatches = 0i64;

    for (wallet_id, user_id, currency, balance, ledger_sum) in rows {
        let matches = balance == ledger_sum;
        if !matches {
            mismatches += 1;
            tracing::warn!(
                wallet_id = %wallet_id,
                user_id = %user_id,
                currency = %currency,
                balance = balance,
                ledger_sum = ledger_sum,
                "Wallet reconciliation mismatch detected"
            );
        }

        results.push(ReconciliationResult {
            wallet_id,
            user_id,
            currency,
            balance_minor: balance,
            ledger_sum_minor: ledger_sum,
            matches,
        });
    }

    if mismatches > 0 {
        tracing::error!(
            mismatches = mismatches,
            total = results.len(),
            "Wallet reconciliation completed with mismatches"
        );
    }

    Ok(Json(ReconciliationResponse {
        total_wallets: results.len() as i64,
        mismatches,
        results,
    }))
}


#[derive(Serialize)]
pub struct UserLedgerResponse {
    pub user_id: Uuid,
    pub wallet_id: Uuid,
    pub currency: String,
    pub balance_minor: i64,
    pub entries: Vec<WalletLedgerEntry>,
}

/// View the full ledger for a specific user's wallet. Admin only.
pub async fn get_user_ledger(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<Uuid>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<UserLedgerResponse>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            error: "unauthorized".into(),
            message: "Admin access required".into(),
        }),
    ))?;

    let wallet = state
        .wallet_repo
        .get_or_create(user_id, crate::domain::models::wallet::CurrencyType::Real)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database_error".into(),
                    message: format!("Wallet lookup failed: {}", e),
                }),
            )
        })?;

    let entries = state
        .wallet_repo
        .get_ledger_entries(wallet.id, 100, 0)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "database_error".into(),
                    message: format!("Ledger query failed: {}", e),
                }),
            )
        })?;

    Ok(Json(UserLedgerResponse {
        user_id,
        wallet_id: wallet.id,
        currency: format!("{:?}", wallet.currency),
        balance_minor: wallet.balance_minor,
        entries,
    }))
}


#[derive(Serialize)]
pub struct FreezeResponse {
    pub wallet_id: Uuid,
    pub user_id: Uuid,
    pub is_frozen: bool,
    pub balance_minor: i64,
    pub message: String,
}

/// Freeze a wallet: blocks all debits, allows credits. Admin only.
pub async fn freeze_wallet(
    State(state): State<Arc<AppState>>,
    Path(wallet_id): Path<Uuid>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<FreezeResponse>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            error: "unauthorized".into(),
            message: "Admin access required".into(),
        }),
    ))?;

    let wallet = state
        .wallet_repo
        .freeze_wallet(wallet_id)
        .await
        .map_err(|e| {
            (
                match e {
                    crate::domain::models::errors::DomainError::WalletNotFound => {
                        StatusCode::NOT_FOUND
                    }
                    _ => StatusCode::INTERNAL_SERVER_ERROR,
                },
                Json(ErrorResponse {
                    error: "wallet_error".into(),
                    message: e.to_string(),
                }),
            )
        })?;

    tracing::warn!(
        wallet_id = %wallet_id,
        user_id = %wallet.user_id,
        "Wallet frozen by admin"
    );

    Ok(Json(FreezeResponse {
        wallet_id: wallet.id,
        user_id: wallet.user_id,
        is_frozen: wallet.is_frozen,
        balance_minor: wallet.balance_minor,
        message: format!("Wallet {} frozen. User {} can no longer bet or withdraw.", wallet_id, wallet.user_id),
    }))
}

/// Unfreeze a wallet. Admin only.
pub async fn unfreeze_wallet(
    State(state): State<Arc<AppState>>,
    Path(wallet_id): Path<Uuid>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<FreezeResponse>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse {
            error: "unauthorized".into(),
            message: "Admin access required".into(),
        }),
    ))?;

    let wallet = state
        .wallet_repo
        .unfreeze_wallet(wallet_id)
        .await
        .map_err(|e| {
            (
                match e {
                    crate::domain::models::errors::DomainError::WalletNotFound => {
                        StatusCode::NOT_FOUND
                    }
                    _ => StatusCode::INTERNAL_SERVER_ERROR,
                },
                Json(ErrorResponse {
                    error: "wallet_error".into(),
                    message: e.to_string(),
                }),
            )
        })?;

    

    Ok(Json(FreezeResponse {
        wallet_id: wallet.id,
        user_id: wallet.user_id,
        is_frozen: wallet.is_frozen,
        balance_minor: wallet.balance_minor,
        message: format!("Wallet {} unfrozen. User {} can bet and withdraw again.", wallet_id, wallet.user_id),
    }))
}
