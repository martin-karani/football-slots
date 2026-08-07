use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, Header, EncodingKey};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::adapters::web::middleware::Claims;
use crate::adapters::web::router::AppState;

#[derive(Deserialize)]
pub struct SendOtpRequest {
    pub phone_number: String,
}

#[derive(Serialize)]
pub struct SendOtpResponse {
    pub message: String,
    pub phone_number: String,
}

pub async fn send_otp(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SendOtpRequest>,
) -> Result<Json<SendOtpResponse>, StatusCode> {
    // Validate phone number format (basic check)
    if req.phone_number.len() < 10 {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Get or create user
    let user = state
        .user_repo
        .get_or_create_by_phone(&req.phone_number)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // In production: generate OTP, hash it, store in DB, send via SMS
    // For scaffold: log the OTP for development
    let otp_code = format!("{:06}", rand::random::<u16>());
    tracing::info!("📱 OTP for {} (dev only): {}", user.phone_number, otp_code);

    // Store hashed OTP in DB (simplified - in production use proper table)
    // For now, we skip DB storage and just return success

    Ok(Json(SendOtpResponse {
        message: "OTP sent successfully".to_string(),
        phone_number: user.phone_number,
    }))
}

#[derive(Deserialize)]
pub struct VerifyOtpRequest {
    pub phone_number: String,
    pub code: String,
}

#[derive(Serialize)]
pub struct VerifyOtpResponse {
    pub token: String,
    pub user_id: Uuid,
    pub phone_number: String,
    pub kyc_status: String,
}

pub async fn verify_otp(
    State(state): State<Arc<AppState>>,
    Json(req): Json<VerifyOtpRequest>,
) -> Result<Json<VerifyOtpResponse>, StatusCode> {
    // In production: verify OTP from DB
    // For scaffold: accept any 6-digit code
    if req.code.len() != 6 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let user = state
        .user_repo
        .get_or_create_by_phone(&req.phone_number)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Create JWT
    let claims = Claims {
        sub: user.id,
        phone: user.phone_number.clone(),
        kyc: format!("{:?}", user.kyc_status).to_lowercase(),
        exp: (Utc::now() + Duration::hours(24)).timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.expose_secret().as_bytes()),
    )
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(VerifyOtpResponse {
        token,
        user_id: user.id,
        phone_number: user.phone_number,
        kyc_status: format!("{:?}", user.kyc_status).to_lowercase(),
    }))
}

/// Extract claims from request extensions.
pub fn extract_claims<B>(req: &axum::http::Request<B>) -> Option<Claims> {
    req.extensions().get::<Claims>().cloned()
}

#[derive(Serialize)]
pub struct MeResponse {
    pub user_id: Uuid,
    pub phone_number: String,
    pub kyc_status: String,
}

/// Returns the current authenticated user's info from the JWT claims.
pub async fn me(
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<MeResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    Ok(Json(MeResponse {
        user_id: claims.sub,
        phone_number: claims.phone,
        kyc_status: claims.kyc,
    }))
}
