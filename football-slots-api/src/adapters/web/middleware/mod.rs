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
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::adapters::web::router::AppState;

// ============================================================
// Rate Limiter — simple in-memory token bucket per key
// ============================================================

/// Tracks the last request timestamp per key (e.g. user_id).
pub struct RateLimiter {
    /// key → last allowed request time
    requests: RwLock<HashMap<String, Instant>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            requests: RwLock::new(HashMap::new()),
        }
    }

    /// Check if a request from `key` is allowed given the cooldown in seconds.
    /// Returns `true` if allowed, `false` if rate-limited.
    pub async fn check(&self, key: &str, cooldown_secs: u64) -> bool {
        if cooldown_secs == 0 {
            return true; // disabled
        }

        let now = Instant::now();

        // Read to check
        {
            let requests = self.requests.read().await;
            if let Some(&last) = requests.get(key) {
                if now.duration_since(last).as_secs() < cooldown_secs {
                    return false; // too soon
                }
            }
        }

        // Write to update
        {
            let mut requests = self.requests.write().await;
            requests.insert(key.to_string(), now);
        }

        // Periodic cleanup: remove entries older than 10 minutes
        // (avoid unbounded memory growth)
        {
            let mut requests = self.requests.write().await;
            requests.retain(|_, ts| now.duration_since(*ts).as_secs() < 600);
        }

        true
    }
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================
// IP Whitelist Middleware — for M-Pesa callbacks
// ============================================================

/// Extract the client IP from the request, handling proxies.
fn extract_client_ip(req: &Request<Body>) -> Option<String> {
    // Check X-Forwarded-For first (reverse proxy)
    if let Some(forwarded) = req.headers().get("X-Forwarded-For") {
        if let Ok(fwd_str) = forwarded.to_str() {
            // X-Forwarded-For can have multiple IPs: client, proxy1, proxy2
            // The first one is the original client
            if let Some(first) = fwd_str.split(',').next() {
                return Some(first.trim().to_string());
            }
        }
    }

    // Fall back to peer address from ConnectInfo extension
    // (set by axum when using ConnectInfo extractor)
    if let Some(remote) = req.extensions().get::<axum::extract::ConnectInfo<std::net::SocketAddr>>() {
        return Some(remote.0.ip().to_string());
    }

    None
}

/// Check if an IP address is in the allowed list.
/// Supports exact IP match and simple CIDR notation (e.g. "111.235.100.0/24").
fn ip_is_allowed(ip: &str, allowed: &[String]) -> bool {
    if allowed.is_empty() {
        return true; // no whitelist configured = allow all (dev mode)
    }

    for pattern in allowed {
        if pattern.contains('/') {
            // CIDR notation — simple check for /8, /16, /24 masks
            if let Some((prefix, suffix)) = pattern.split_once('/') {
                if let Ok(bits) = suffix.parse::<u32>() {
                    if ip_matches_cidr(ip, prefix, bits) {
                        return true;
                    }
                }
            }
        } else {
            // Exact match
            if ip == pattern {
                return true;
            }
        }
    }
    false
}

/// Check if an IP matches a CIDR prefix at the specified bit depth.
/// Works for common /8, /16, /24 masks.
fn ip_matches_cidr(ip: &str, prefix: &str, bits: u32) -> bool {
    let ip_bytes = ip_to_bytes(ip);
    let prefix_bytes = ip_to_bytes(prefix);
    if ip_bytes.len() != prefix_bytes.len() {
        return false;
    }

    let full_bytes = bits / 8;
    let remaining_bits = bits % 8;

    // Check full bytes
    for i in 0..full_bytes as usize {
        if i >= ip_bytes.len() {
            break;
        }
        if ip_bytes[i] != prefix_bytes[i] {
            return false;
        }
    }

    // Check remaining bits in the next byte
    if remaining_bits > 0 && (full_bytes as usize) < ip_bytes.len() {
        let mask = !(0u8 >> remaining_bits);
        if (ip_bytes[full_bytes as usize] & mask) != (prefix_bytes[full_bytes as usize] & mask) {
            return false;
        }
    }

    true
}

fn ip_to_bytes(ip: &str) -> Vec<u8> {
    ip.split('.')
        .filter_map(|s| s.parse::<u8>().ok())
        .collect()
}

/// Middleware that rejects requests from non-whitelisted IPs.
/// Used on M-Pesa callback endpoints to prevent forged callbacks.
pub async fn ip_whitelist_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    let client_ip = extract_client_ip(&req).unwrap_or_else(|| "unknown".to_string());

    if !ip_is_allowed(&client_ip, &state.config.mpesa_callback_allowed_ips) {
        tracing::warn!(
            "Rejected M-Pesa callback from unauthorized IP: {}",
            client_ip
        );
        return Err((
            StatusCode::FORBIDDEN,
            format!("Unauthorized IP: {}", client_ip),
        ));
    }

    // Inject the client IP into request extensions for downstream use
    req.extensions_mut().insert(client_ip);
    Ok(next.run(req).await)
}

// ============================================================
// JWT Authentication Middleware
// ============================================================

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
    State(state): State<Arc<AppState>>,
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
