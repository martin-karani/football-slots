use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::handlers::ErrorResponse;
use crate::adapters::web::router::AppState;
use crate::domain::models::errors::DomainError;

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

// ============================================================
// Deposits
// ============================================================

#[derive(Deserialize)]
pub struct DepositRequest {
    pub phone_number: String,
    pub amount_minor: i64,
}

#[derive(Serialize)]
pub struct DepositResponse {
    pub checkout_request_id: Option<String>,
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

    let user = state
        .user_repo
        .find_by_id(claims.sub)
        .await
        .map_err(error_response)?
        .ok_or((StatusCode::NOT_FOUND, Json(ErrorResponse { error: "not_found".into(), message: "User not found".into() })))?;

    user.can_deposit(chrono::Utc::now()).map_err(error_response)?;

    // Rate limiting: prevent rapid-fire STK push requests (each costs the business)
    if !state
        .rate_limiter
        .check(&format!("deposit:{}", claims.sub), state.config.deposit_rate_limit_seconds)
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

    // Daily deposit limit enforcement
    let daily_limit = user
        .daily_deposit_limit_minor
        .unwrap_or(state.config.daily_deposit_limit_minor);
    let already_deposited_today = state.wallet_repo.get_today_deposits(claims.sub).await.unwrap_or(0);
    if already_deposited_today + body.amount_minor > daily_limit {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "deposit_limit_exceeded".into(),
                message: format!(
                    "Deposit exceeds your daily limit of KES {:.2}",
                    daily_limit as f64 / 100.0
                ),
            }),
        ));
    }

    let tx = state
        .mpesa_service
        .initiate_stk_push(claims.sub, &body.phone_number, body.amount_minor)
        .await
        .map_err(error_response)?;

    Ok(Json(DepositResponse {
        checkout_request_id: tx.checkout_request_id,
        status: format!("{:?}", tx.status),
        message: "STK Push initiated. Check your phone.".to_string(),
    }))
}

#[derive(Serialize)]
pub struct CallbackResponse {
    pub result_code: i32,
    pub result_desc: String,
}

#[axum::debug_handler]
pub async fn handle_callback(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    let payload_clone = payload.clone();
    let checkout_id = payload_clone["Body"]["stkCallback"]["CheckoutRequestID"].as_str().unwrap_or("");

    if checkout_id.is_empty() {
        return Json(CallbackResponse { result_code: 1, result_desc: "Missing CheckoutRequestID".to_string() });
    }

    match state.mpesa_service.process_callback(checkout_id, payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("M-Pesa callback processing failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed internally)".to_string() })
        }
    }
}

// ============================================================
// Withdrawals
// ============================================================

#[derive(Deserialize)]
pub struct WithdrawRequest {
    pub phone_number: String,
    pub amount_minor: i64,
}

#[derive(Serialize)]
pub struct WithdrawResponse {
    pub transaction_id: uuid::Uuid,
    pub status: String,
    pub message: String,
}

#[axum::debug_handler]
pub async fn initiate_withdrawal(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<WithdrawResponse>, (StatusCode, Json<ErrorResponse>)> {
    let claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Missing or invalid token".into() }),
    ))?;

    let body: WithdrawRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid body".into() })))
        .and_then(|bytes| {
            serde_json::from_slice(&bytes)
                .map_err(|_| (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: "bad_request".into(), message: "Invalid JSON".into() })))
        })?;

    // Phone verification: withdrawal must go to the registered phone number.
    // This prevents account takeover from draining funds to a different phone.
    let user = state
        .user_repo
        .find_by_id(claims.sub)
        .await
        .map_err(error_response)?
        .ok_or((StatusCode::NOT_FOUND, Json(ErrorResponse { error: "not_found".into(), message: "User not found".into() })))?;

    if user.phone_number != body.phone_number {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "withdrawal_phone_mismatch".into(),
                message: "Withdrawal phone must match your registered phone number.".into(),
            }),
        ));
    }

    let tx = state
        .mpesa_service
        .initiate_withdrawal(claims.sub, &body.phone_number, body.amount_minor)
        .await
        .map_err(error_response)?;

    Ok(Json(WithdrawResponse {
        transaction_id: tx.id,
        status: format!("{:?}", tx.status),
        message: "Withdrawal submitted. Funds are on the way.".to_string(),
    }))
}

#[axum::debug_handler]
pub async fn handle_b2c_result(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    match state.mpesa_service.process_b2c_result(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("B2C result processing failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed internally)".to_string() })
        }
    }
}

#[axum::debug_handler]
pub async fn handle_b2c_timeout(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    // Safaricom posts the same envelope shape to the timeout URL when a
    // request sits in the queue too long -- route it through the same
    // settle-or-reverse logic as a normal result.
    match state.mpesa_service.process_b2c_result(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("B2C timeout processing failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed internally)".to_string() })
        }
    }
}
