use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
    body::Body,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::adapters::web::router::AppState;

/// JWT claims stored in the token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,    // user_id
    pub phone: String,
    pub kyc: String,  // kyc_status
    pub exp: usize,
}

/// Authentication middleware that extracts and validates JWT.
pub async fn auth_middleware(
    State(state): State<std::sync::Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    use axum::http::header;

    let auth_header = req.headers().get(header::AUTHORIZATION);

    let token = match auth_header {
        Some(h) => h.to_str().ok().and_then(|s| {
            s.strip_prefix("Bearer ").map(String::from)
        }),
        None => None,
    };

    let token = match token {
        Some(t) => t,
        None => return Err(StatusCode::UNAUTHORIZED),
    };

    let validation = Validation::default();
    let claims = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.expose_secret().as_bytes()),
        &validation,
    )
    .map_err(|_| StatusCode::UNAUTHORIZED)?;

    // Inject claims into request extensions
    req.extensions_mut().insert(claims.claims);
    Ok(next.run(req).await)
}
