use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::router::AppState;
use crate::domain::models::errors::DomainError;

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
) -> Result<Json<DepositResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let body: DepositRequest = axum::body::to_bytes(req.into_body(), 65536)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)
        .and_then(|bytes| serde_json::from_slice(&bytes).map_err(|_| StatusCode::BAD_REQUEST))?;

    // Validate amount
    if body.amount_minor <= 0 {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check deposit limit
    let user = state
        .user_repo
        .find_by_id(claims.sub)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    user.can_deposit(chrono::Utc::now())
        .map_err(|_| StatusCode::FORBIDDEN)?;

    // Initiate STK Push
    match state
        .mpesa_service
        .initiate_stk_push(claims.sub, &body.phone_number, body.amount_minor)
        .await
    {
        Ok(tx) => Ok(Json(DepositResponse {
            checkout_request_id: tx.checkout_request_id,
            status: format!("{:?}", tx.status),
            message: "STK Push initiated. Check your phone.".to_string(),
        })),
        Err(e) => Err(match e {
            DomainError::Payment(_) => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        }),
    }
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
    // Extract checkout request ID (clone to avoid borrow conflict)
    let stk_callback = &payload.clone()["Body"]["stkCallback"];
    let checkout_id = stk_callback["CheckoutRequestID"].as_str().unwrap_or("");

    if checkout_id.is_empty() {
        return Json(CallbackResponse {
            result_code: 1,
            result_desc: "Missing CheckoutRequestID".to_string(),
        });
    }

    // Process callback
    match state
        .mpesa_service
        .process_callback(checkout_id, payload)
        .await
    {
        Ok(_) => Json(CallbackResponse {
            result_code: 0,
            result_desc: "Accepted".to_string(),
        }),
        Err(e) => {
            tracing::error!("M-Pesa callback processing failed: {}", e);
            Json(CallbackResponse {
                result_code: 0, // Still accept to prevent retries on our error
                result_desc: "Accepted (processing failed internally)".to_string(),
            })
        }
    }
}
