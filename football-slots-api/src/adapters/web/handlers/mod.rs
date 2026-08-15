pub mod admin;
pub mod auth;
pub mod bonus;
pub mod game;
pub mod wallet;
pub mod mpesa;
pub mod health;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}

pub async fn not_found(_req: Request<Body>) -> (StatusCode, Json<ErrorResponse>) {
    (
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "not_found".to_string(),
            message: "The requested resource was not found".to_string(),
        }),
    )
}
