use axum::{
    body::Body,
    extract::rejection::JsonRejection,
    http::{Request, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::de::DeserializeOwned;

use crate::domain::models::errors::DomainError;
use crate::adapters::web::handlers::ErrorResponse;

/// Request body size limit for handlers that read the body manually.
const MAX_BODY_BYTES: usize = 65_536;

#[derive(Debug)]
pub enum AppError {
    Domain(DomainError),
    /// Body wasn't readable, or wasn't valid JSON for the target type.
    BadRequest(String),
    /// Missing `Authorization` header, or the JWT didn't decode/verify.
    Unauthorized(String),
    /// Anything else unexpected: DB errors not yet wrapped in DomainError,
    /// a provider HTTP call failing outside the normal adapter path, etc.
    Internal(anyhow::Error),
}

impl AppError {
    fn status_and_code(&self) -> (StatusCode, &'static str) {
        use DomainError as D;
        match self {
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
            AppError::Domain(e) => match e {
                D::InsufficientBalance => (StatusCode::PAYMENT_REQUIRED, "insufficient_balance"),
                D::WalletNotFound | D::UserNotFound => (StatusCode::NOT_FOUND, "not_found"),
                D::KycRequired => (StatusCode::FORBIDDEN, "kyc_required"),
                D::SelfExcluded(_) => (StatusCode::FORBIDDEN, "self_excluded"),
                D::DepositLimitExceeded { .. } => (StatusCode::BAD_REQUEST, "deposit_limit_exceeded"),
                D::MinimumWithdrawalNotMet { .. } => (StatusCode::BAD_REQUEST, "minimum_withdrawal_not_met"),
                D::MaximumWithdrawalExceeded { .. } => (StatusCode::BAD_REQUEST, "maximum_withdrawal_exceeded"),
                D::WithdrawalLimitExceeded { .. } => (StatusCode::BAD_REQUEST, "withdrawal_limit_exceeded"),
                D::PendingWithdrawalExists => (StatusCode::CONFLICT, "pending_withdrawal_exists"),
                D::InvalidStake(_) => (StatusCode::BAD_REQUEST, "invalid_stake"),
                D::NoBetsPlaced => (StatusCode::BAD_REQUEST, "no_bets_placed"),
                D::RoundAlreadyCompleted => (StatusCode::CONFLICT, "round_already_completed"),
                D::OtpVerificationFailed => (StatusCode::BAD_REQUEST, "otp_verification_failed"),
                D::OtpExpired => (StatusCode::BAD_REQUEST, "otp_expired"),
                D::AuthenticationRequired => (StatusCode::UNAUTHORIZED, "authentication_required"),
                D::WithdrawalPhoneMismatch => (StatusCode::FORBIDDEN, "withdrawal_phone_mismatch"),
                D::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
                D::UnauthorizedCallbackIp(_) => (StatusCode::FORBIDDEN, "unauthorized_callback_ip"),
                D::WalletReconciliationMismatch { .. } => {
                    (StatusCode::INTERNAL_SERVER_ERROR, "reconciliation_mismatch")
                }
                D::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
                D::Validation(_) => (StatusCode::BAD_REQUEST, "validation_error"),
                D::ProviderNotEnabled(_) => (StatusCode::BAD_REQUEST, "provider_not_enabled"),
                D::AmountMismatch { .. } => (StatusCode::INTERNAL_SERVER_ERROR, "amount_mismatch"),
                D::IdempotencyConflict => (StatusCode::CONFLICT, "idempotency_conflict"),
                D::ProviderRejected(_) => (StatusCode::SERVICE_UNAVAILABLE, "provider_rejected"),
                D::ProviderOutcomeUnknown(_) => (StatusCode::SERVICE_UNAVAILABLE, "provider_outcome_unknown"),
                D::Payment(_) => (StatusCode::SERVICE_UNAVAILABLE, "payment_provider_error"),
                D::Repository(_) | D::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
            },
        }
    }

    /// The message sent to the *client*. Internal/DB errors get a generic
    /// message — the real detail already went to the log in `into_response`.
    fn client_message(&self) -> String {
        match self {
            AppError::Internal(_) => "Something went wrong on our end.".to_string(),
            AppError::Domain(DomainError::Repository(_) | DomainError::Database(_)) => {
                "Something went wrong on our end.".to_string()
            }
            other => other.to_string(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Domain(e) => write!(f, "{e}"),
            AppError::BadRequest(msg) => write!(f, "bad request: {msg}"),
            AppError::Unauthorized(msg) => write!(f, "unauthorized: {msg}"),
            AppError::Internal(e) => write!(f, "internal error: {e:#}"),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = self.status_and_code();

        // Log the real error server-side so developers can debug.
        // 5xx = error! level (something to fix). 4xx = warn! level (expected rejection).
        if status.is_server_error() {
            tracing::error!(error_code = code, status = %status, "{self}");
        } else {
            tracing::warn!(error_code = code, status = %status, "{self}");
        }

        let body = ErrorResponse {
            error: code.to_string(),
            message: self.client_message(),
        };
        (status, Json(body)).into_response()
    }
}

impl From<DomainError> for AppError {
    fn from(e: DomainError) -> Self {
        AppError::Domain(e)
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e)
    }
}

impl From<JsonRejection> for AppError {
    fn from(rej: JsonRejection) -> Self {
        AppError::BadRequest(rej.body_text())
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// Pulls the JWT claims the upstream `auth_middleware` already validated
/// and stashed on the request. Replaces the repeated
/// `extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?` pattern.
pub fn require_claims<B>(req: &Request<B>) -> AppResult<crate::adapters::web::middleware::Claims> {
    req.extensions()
        .get::<crate::adapters::web::middleware::Claims>()
        .cloned()
        .ok_or_else(|| AppError::Unauthorized("missing or invalid token".to_string()))
}

/// Reads and JSON-decodes a request body. Consumes `req` — call
/// `require_claims(&req)` or read headers first if you need those too.
pub async fn parse_json_body<T: DeserializeOwned>(req: Request<Body>) -> AppResult<T> {
    let bytes = axum::body::to_bytes(req.into_body(), MAX_BODY_BYTES)
        .await
        .map_err(|e| AppError::BadRequest(format!("could not read request body: {e}")))?;
    serde_json::from_slice(&bytes).map_err(|e| AppError::BadRequest(format!("invalid JSON body: {e}")))
}
