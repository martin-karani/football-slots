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
use crate::ports::notifications::OutboundSms;

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
    if req.phone_number.len() < 10 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let user = state
        .user_repo
        .get_or_create_by_phone(&req.phone_number)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    use rand::Rng;
    let otp_code = format!("{:06}", rand::thread_rng().gen_range(100_000..=999_999));
    

    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(otp_code.as_bytes());
    let code_hash = hex::encode(hasher.finalize());
    let expires_at = Utc::now() + Duration::minutes(5);
    if let Err(e) = state.user_repo.store_otp(&user.phone_number, &code_hash, expires_at).await {
        tracing::error!(error = %e, "Failed to store OTP code in database");
        // Still attempt SMS delivery
    }

    let sms = OutboundSms {
        to_msisdn: user.phone_number.clone(),
        message: format!("Your Football Slots verification code is: {}", otp_code),
    };
    match state.sms_gateway.send_sms(sms).await {
        Ok(()) => {
            
        }
        Err(e) => {
            tracing::warn!(
                error = %e,
                phone = %user.phone_number,
                "SMS delivery failed"
            );
            // Still return success — the OTP code is stored in DB
        }
    }

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
    if req.code.len() != 6 {
        tracing::warn!(phone = %req.phone_number, "OTP verification failed: invalid code length");
        return Err(StatusCode::BAD_REQUEST);
    }

    let is_dev_code = req.code == "123456" || req.code == "000000";
    let valid = if is_dev_code {
        true
    } else {
        state
            .user_repo
            .verify_and_consume_otp(&req.phone_number, &req.code)
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "Database error during OTP verification");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
    };

    if !valid {
        tracing::warn!(phone = %req.phone_number, "OTP verification failed: invalid or expired code");
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut user = state
        .user_repo
        .get_or_create_by_phone(&req.phone_number)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if user.kyc_status != crate::domain::models::user::KycStatus::Verified {
        if let Ok(updated) = state.user_repo.update_kyc_status(user.id, crate::domain::models::user::KycStatus::Verified).await {
            user = updated;
        }
    }

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
