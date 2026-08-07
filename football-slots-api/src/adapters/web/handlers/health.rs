use axum::{http::StatusCode, Json};
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

pub async fn ready() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ready".to_string(),
        service: "football-slots-api".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

pub async fn alive() -> StatusCode {
    StatusCode::OK
}
