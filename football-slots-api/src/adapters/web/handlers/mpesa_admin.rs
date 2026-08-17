use axum::{extract::State, http::StatusCode, Json};
use serde::Deserialize;
use std::sync::Arc;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::handlers::ErrorResponse;
use crate::adapters::web::router::AppState;
use crate::domain::models::errors::DomainError;

fn error_response(e: DomainError) -> (StatusCode, Json<ErrorResponse>) {
    let (status, code) = match &e {
        DomainError::Payment(_) => (StatusCode::SERVICE_UNAVAILABLE, "payment_provider_error"),
        _ => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
    };
    (
        status,
        Json(ErrorResponse {
            error: code.to_string(),
            message: e.to_string(),
        }),
    )
}

/// Trigger an Account Balance check.
pub async fn trigger_account_balance_check(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    match state.mpesa_adapter.query_account_balance().await {
        Ok(query) => Ok(Json(serde_json::json!({
            "status": "requested",
            "originator_id": query.originator_conversation_id,
            "message": "Balance check initiated. Results will arrive via webhook."
        }))),
        Err(e) => Err(error_response(e))
    }
}

/// Get the latest cached Account Balance.
pub async fn get_latest_account_balance(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let _claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let balance = state.mpesa_adapter.get_latest_balance().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(b) = balance {
        Ok(Json(serde_json::json!({
            "originator_conversation_id": b.originator_conversation_id,
            "status": b.status,
            "working_account_minor": b.working_account_minor,
            "utility_account_minor": b.utility_account_minor,
            "merchant_account_minor": b.merchant_account_minor,
            "charges_paid_account_minor": b.charges_paid_account_minor,
            "last_updated": b.updated_at
        })))
    } else {
        Ok(Json(serde_json::json!({ "message": "No balance data available yet." })))
    }
}

/// Trigger Pull Transactions reconciliation.
pub async fn trigger_reconciliation(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    match state.mpesa_adapter.reconcile_missed_transactions().await {
        Ok(credited) => Ok(Json(serde_json::json!({
            "status": "complete",
            "transactions_credited": credited,
            "message": format!("Reconciliation complete. {} transactions credited.", credited)
        }))),
        Err(e) => Err(error_response(e))
    }
}

/// List unmatched deposits for manual reconciliation.
pub async fn list_unmatched_deposits(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    let limit = 50i64;
    let offset = 0i64;

    match state.mpesa_adapter.list_unmatched_deposits(limit, offset).await {
        Ok(deposits) => Ok(Json(serde_json::json!({
            "deposits": deposits,
            "total": deposits.len()
        }))),
        Err(e) => Err(error_response(e))
    }
}

/// Resolve an unmatched deposit by crediting a user's wallet.
#[derive(Deserialize)]
pub struct ResolveUnmatchedRequest {
    pub user_id: uuid::Uuid,
}

pub async fn resolve_unmatched_deposit(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let path = req.uri().path().to_string();
    let deposit_id = path.strip_prefix("/api/v1/admin/payments/mpesa/unmatched-deposits/")
        .and_then(|p| p.strip_suffix("/resolve"))
        .and_then(|p| p.parse::<uuid::Uuid>().ok())
        .ok_or((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "bad_request".into(),
            message: "Invalid deposit ID in path".into(),
        })))?;

    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    let body: ResolveUnmatchedRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid body".into() })))
        .and_then(|bytes| {
            serde_json::from_slice(&bytes)
                .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid JSON".into() })))
        })?;

    match state.mpesa_adapter.resolve_unmatched_deposit(deposit_id, body.user_id).await {
        Ok(deposit) => Ok(Json(serde_json::json!({
            "status": "resolved",
            "deposit": deposit
        }))),
        Err(e) => Err(error_response(e))
    }
}

/// Register C2B Confirmation and Validation URLs.
pub async fn register_c2b_urls(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    match state.mpesa_adapter.register_c2b_urls().await {
        Ok(()) => Ok(Json(serde_json::json!({
            "status": "registered",
            "message": "C2B URLs registered successfully."
        }))),
        Err(e) => Err(error_response(e))
    }
}

/// Register for Pull Transactions API (one-time prerequisite).
pub async fn register_pull_transactions(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    match state.mpesa_adapter.register_pull_transactions().await {
        Ok(()) => Ok(Json(serde_json::json!({
            "status": "registered",
            "message": "Pull Transactions registration complete."
        }))),
        Err(e) => Err(error_response(e))
    }
}

// ============================================================
// B2B — Business Pay Bill
// ============================================================

#[derive(Deserialize)]
pub struct BusinessPayBillRequest {
    pub paybill_number: String,
    pub amount_minor: i64,
    pub account_reference: String,
    pub remarks: String,
}

/// Initiate a B2B payment to a Pay Bill.
pub async fn initiate_business_pay_bill(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    let body: BusinessPayBillRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid body".into() })))
        .and_then(|bytes| {
            serde_json::from_slice(&bytes)
                .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid JSON".into() })))
        })?;

    if body.amount_minor <= 0 {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "bad_request".into(),
            message: "Amount must be positive".into(),
        })));
    }

    match state.mpesa_adapter.business_pay_bill(
        body.amount_minor,
        &body.paybill_number,
        &body.account_reference,
        &body.remarks,
    ).await {
        Ok(response) => Ok(Json(serde_json::json!({
            "status": "submitted",
            "originator_conversation_id": response["OriginatorConversationID"].as_str().unwrap_or(""),
            "message": "B2B payment submitted. Results will arrive via webhook."
        }))),
        Err(e) => Err(error_response(e))
    }
}
