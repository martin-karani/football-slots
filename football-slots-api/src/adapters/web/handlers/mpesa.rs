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
        DomainError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
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
    match state.mpesa_service.process_b2c_result(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("B2C timeout processing failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed internally)".to_string() })
        }
    }
}

// ============================================================
// C2B (Manual Paybill Deposits) — Webhooks
// ============================================================

#[axum::debug_handler]
pub async fn handle_c2b_confirmation(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    match state.mpesa_service.process_c2b_confirmation(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("C2B confirmation processing failed: {}", e);
            // Always return 0 to Safaricom so it doesn't retry on our internal errors
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed internally)".to_string() })
        }
    }
}

#[axum::debug_handler]
pub async fn handle_c2b_validation(
    State(_state): State<Arc<AppState>>,
    Json(_payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    // Optional: add logic to reject payments from self-excluded users or banned MSISDNs.
    // For now, accept all manual payments.
    Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() })
}

// ============================================================
// Account Balance API — Webhooks
// ============================================================

#[axum::debug_handler]
pub async fn handle_account_balance_result(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    match state.mpesa_service.process_account_balance_callback(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("Account balance callback failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed)".to_string() })
        }
    }
}

#[axum::debug_handler]
pub async fn handle_account_balance_timeout(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    // Same handler as result — just mark as timeout
    match state.mpesa_service.process_account_balance_callback(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("Account balance timeout callback failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed)".to_string() })
        }
    }
}

// ============================================================
// Admin Endpoints
// ============================================================

/// Trigger an Account Balance check.
pub async fn trigger_account_balance_check(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let _claims = extract_claims(&req).ok_or((
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponse { error: "unauthorized".into(), message: "Admin access required".into() }),
    ))?;

    match state.mpesa_service.query_account_balance().await {
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

    let balance = state.mpesa_service.get_latest_balance().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some(b) = balance {
        Ok(Json(serde_json::json!({
            "working_account_kes": b.working_account_kes,
            "utility_account_kes": b.utility_account_kes,
            "merchant_account_kes": b.merchant_account_kes,
            "charges_paid_kes": b.charges_paid_kes,
            "last_updated": b.last_updated
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

    match state.mpesa_service.reconcile_missed_transactions().await {
        Ok(credited) => Ok(Json(serde_json::json!({
            "status": "complete",
            "transactions_credited": credited,
            "message": format!("Reconciliation complete. {} transactions credited.", credited)
        }))),
        Err(e) => Err(error_response(e))
    }
}

/// List unmatched C2B deposits for manual reconciliation.
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

    match state.mpesa_service.list_unmatched_deposits(limit, offset).await {
        Ok(deposits) => Ok(Json(serde_json::json!({
            "deposits": deposits,
            "total": deposits.len()
        }))),
        Err(e) => Err(error_response(e))
    }
}

/// Resolve an unmatched C2B deposit by crediting a user's wallet.
#[derive(Deserialize)]
pub struct ResolveUnmatchedRequest {
    pub user_id: uuid::Uuid,
}

pub async fn resolve_unmatched_deposit(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let path = req.uri().path().to_string();
    // Extract deposit_id from path: /admin/mpesa/unmatched-deposits/:id/resolve
    let deposit_id = path.strip_prefix("/api/v1/admin/mpesa/unmatched-deposits/")
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

    match state.mpesa_service.resolve_unmatched_deposit(deposit_id, body.user_id).await {
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

    match state.mpesa_service.register_c2b_urls().await {
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

    match state.mpesa_service.register_pull_transactions().await {
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

    match state.mpesa_service.business_pay_bill(
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

/// Handle B2B result callback from M-Pesa.
#[axum::debug_handler]
pub async fn handle_b2b_result(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    match state.mpesa_service.process_b2b_result(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("B2B result processing failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed internally)".to_string() })
        }
    }
}

/// Handle B2B timeout callback from M-Pesa.
#[axum::debug_handler]
pub async fn handle_b2b_timeout(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<serde_json::Value>,
) -> Json<CallbackResponse> {
    // Same handler as result — treat timeout as a failed result
    match state.mpesa_service.process_b2b_result(payload).await {
        Ok(_) => Json(CallbackResponse { result_code: 0, result_desc: "Accepted".to_string() }),
        Err(e) => {
            tracing::error!("B2B timeout processing failed: {}", e);
            Json(CallbackResponse { result_code: 0, result_desc: "Accepted (processing failed internally)".to_string() })
        }
    }
}
