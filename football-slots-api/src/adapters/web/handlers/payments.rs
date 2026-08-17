use axum::{extract::{Path, State}, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::handlers::ErrorResponse;
use crate::adapters::web::router::AppState;
use crate::domain::models::errors::DomainError;
use crate::domain::models::payment::PaymentProvider;

fn error_response(e: DomainError) -> (StatusCode, Json<ErrorResponse>) {
    let (status, code) = match &e {
        DomainError::InsufficientBalance => (StatusCode::PAYMENT_REQUIRED, "insufficient_balance"),
        DomainError::WalletNotFound | DomainError::UserNotFound => (StatusCode::NOT_FOUND, "not_found"),
        DomainError::KycRequired => (StatusCode::FORBIDDEN, "kyc_required"),
        DomainError::SelfExcluded(_) => (StatusCode::FORBIDDEN, "self_excluded"),
        DomainError::DepositLimitExceeded { .. } => (StatusCode::BAD_REQUEST, "deposit_limit_exceeded"),
        DomainError::MinimumWithdrawalNotMet { .. } => (StatusCode::BAD_REQUEST, "minimum_withdrawal_not_met"),
        DomainError::MaximumWithdrawalExceeded { .. } => (StatusCode::BAD_REQUEST, "maximum_withdrawal_exceeded"),
        DomainError::WithdrawalLimitExceeded { .. } => (StatusCode::BAD_REQUEST, "withdrawal_limit_exceeded"),
        DomainError::PendingWithdrawalExists => (StatusCode::CONFLICT, "pending_withdrawal_exists"),
        DomainError::ProviderNotEnabled(_) => (StatusCode::BAD_REQUEST, "provider_not_enabled"),
        DomainError::ProviderRejected(_) => (StatusCode::SERVICE_UNAVAILABLE, "provider_rejected"),
        DomainError::IdempotencyConflict => (StatusCode::CONFLICT, "idempotency_conflict"),
        DomainError::AmountMismatch { .. } => (StatusCode::INTERNAL_SERVER_ERROR, "amount_mismatch"),
        DomainError::WithdrawalPhoneMismatch => (StatusCode::FORBIDDEN, "withdrawal_phone_mismatch"),
        DomainError::Payment(_) => (StatusCode::SERVICE_UNAVAILABLE, "payment_provider_error"),
        DomainError::Validation(_) => (StatusCode::BAD_REQUEST, "validation_error"),
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

// ============================================================
// Provider listing
// ============================================================

#[derive(Serialize)]
pub struct ProvidersResponse {
    pub providers: Vec<serde_json::Value>,
}

pub async fn list_providers(
    State(state): State<Arc<AppState>>,
) -> Result<Json<ProvidersResponse>, StatusCode> {
    let providers = state.payment_repo.list_enabled_providers().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(ProvidersResponse {
        providers: providers.into_iter().map(|p| serde_json::json!({
            "code": p.code,
            "display_name": p.display_name,
            "enabled": p.enabled,
            "supports_deposit": p.supports_deposit,
            "supports_withdrawal": p.supports_withdrawal,
        })).collect(),
    }))
}

// ============================================================
// Deposits
// ============================================================

#[derive(Deserialize)]
pub struct DepositRequest {
    pub provider: String,
    pub phone_number: String,
    pub amount_minor: i64,
}

#[derive(Serialize)]
pub struct DepositResponse {
    pub transaction_id: uuid::Uuid,
    pub status: String,
    pub message: String,
}

pub async fn initiate_deposit(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<DepositResponse>, (StatusCode, Json<ErrorResponse>)> {
    let claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Missing or invalid token".into() }),
    ))?;

    // Extract idempotency key BEFORE consuming the body
    let idempotency_key = req.headers()
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let body: DepositRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid body".into() })))
        .and_then(|bytes| {
            serde_json::from_slice(&bytes)
                .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid JSON".into() })))
        })?;

    if body.amount_minor <= 0 {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Amount must be positive".into() })));
    }

    let provider = PaymentProvider::from_name(&body.provider)
        .ok_or((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Unknown provider".into() })))?;

    // Rate limiting
    if !state
        .rate_limiter
        .check(&format!("deposit:{}", claims.sub), state.config.payments.deposit_rate_limit_seconds)
        .await
    {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponse {
                error: "rate_limited".into(),
                message: "Too many deposit requests. Please wait before trying again.".into(),
            }),
        ));
    }

    let tx = state
        .payment_gateway
        .deposit(claims.sub, provider, &body.phone_number, body.amount_minor, idempotency_key)
        .await
        .map_err(error_response)?;

    Ok(Json(DepositResponse {
        transaction_id: tx.id,
        status: tx.status,
        message: "Deposit initiated. Check your phone.".to_string(),
    }))
}

// ============================================================
// Withdrawals
// ============================================================

#[derive(Deserialize)]
pub struct WithdrawRequest {
    pub provider: String,
    pub phone_number: String,
    pub amount_minor: i64,
}

#[derive(Serialize)]
pub struct WithdrawResponse {
    pub transaction_id: uuid::Uuid,
    pub status: String,
    pub message: String,
}

pub async fn initiate_withdrawal(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<WithdrawResponse>, (StatusCode, Json<ErrorResponse>)> {
    let claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Missing or invalid token".into() }),
    ))?;

    // Extract idempotency key BEFORE consuming the body
    let idempotency_key = req.headers()
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let body: WithdrawRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid body".into() })))
        .and_then(|bytes| {
            serde_json::from_slice(&bytes)
                .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid JSON".into() })))
        })?;

    let provider = PaymentProvider::from_name(&body.provider)
        .ok_or((StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Unknown provider".into() })))?;

    let tx = state
        .payment_gateway
        .withdraw(claims.sub, provider, &body.phone_number, body.amount_minor, idempotency_key)
        .await
        .map_err(error_response)?;

    Ok(Json(WithdrawResponse {
        transaction_id: tx.id,
        status: tx.status,
        message: "Withdrawal submitted. Funds are on the way.".to_string(),
    }))
}

// ============================================================
// History
// ============================================================

#[derive(Serialize)]
pub struct HistoryResponse {
    pub transactions: Vec<serde_json::Value>,
}

pub async fn history(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<HistoryResponse>, (StatusCode, Json<ErrorResponse>)> {
    let claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Missing or invalid token".into() }),
    ))?;

    let limit: i64 = req.uri().query()
        .and_then(|q| {
            url::form_urlencoded::parse(q.as_bytes())
                .find_map(|(k, v)| if k == "limit" { Some(v) } else { None })
                .and_then(|v| v.parse().ok())
        })
        .unwrap_or(20);

    let transactions = state
        .payment_repo
        .find_by_user(claims.sub, limit)
        .await
        .map_err(error_response)?;

    Ok(Json(HistoryResponse {
        transactions: transactions.into_iter().map(|t| serde_json::json!({
            "id": t.id,
            "provider": t.provider,
            "direction": t.direction,
            "status": t.status,
            "currency": t.currency,
            "amount_minor": t.amount_minor,
            "phone_number": t.phone_number,
            "provider_receipt": t.provider_receipt,
            "result_code": t.result_code,
            "result_desc": t.result_desc,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        })).collect(),
    }))
}

// ============================================================
// Generic webhook handler
// ============================================================

pub async fn provider_webhook(
    State(state): State<Arc<AppState>>,
    Path((provider_code, webhook)): Path<(String, String)>,
    Json(payload): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let Some(provider) = PaymentProvider::from_name(&provider_code) else {
        return Json(serde_json::json!({"result_code": 1, "result_desc": "unknown provider"}));
    };

    // 1. Persist FIRST so a processing failure never loses the callback.
    let event_id = match state.payment_repo.record_webhook_event(&provider_code, &webhook, payload.clone()).await {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("failed to persist webhook event: {e}");
            return Json(serde_json::json!({"result_code": 1, "result_desc": "internal error"}));
        }
    };

    // 2. Process (atomic, idempotent). On error the stored event stays available for retry.
    match state.payment_gateway.handle_webhook(provider, &webhook, payload, event_id).await {
        Ok(()) => Json(serde_json::json!({"result_code": 0, "result_desc": "accepted"})),
        Err(e) => {
            tracing::error!("webhook {}/{} processing failed: {e}", provider_code, webhook);
            state.payment_repo.update_webhook_event(event_id, None, None, None, "failed", Some(e.to_string())).await.ok();
            Json(serde_json::json!({"result_code": 0, "result_desc": "accepted"}))
        }
    }
}
