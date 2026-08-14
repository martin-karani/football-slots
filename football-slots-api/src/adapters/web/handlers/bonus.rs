use axum::{extract::State, http::StatusCode, Json};
use std::sync::Arc;

use crate::adapters::web::handlers::auth::extract_claims;
use crate::adapters::web::router::AppState;
use crate::domain::services::bonus_service::BonusStatusResponse;

pub async fn status(
    State(state): State<Arc<AppState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Result<Json<BonusStatusResponse>, StatusCode> {
    let claims = extract_claims(&req).ok_or(StatusCode::UNAUTHORIZED)?;

    let status = state
        .bonus_service
        .get_status(claims.sub, &state.config)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(status))
}
