use axum::{
    extract::State,
    http::{Request, HeaderValue, StatusCode},
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
use tracing::Instrument;
use uuid::Uuid;

use crate::adapters::web::router::AppState;

// ============================================================
// Request Context Middleware — adds request ID + tracing span
// ============================================================

// Silence dead-code warning: the field is stored in request extensions
// and read back by handlers, but never directly accessed in this file.
#[allow(dead_code)]
#[derive(Clone, Copy)]
struct RequestId(Uuid);

/// Top-level middleware that adds a request ID, tracing span, and logs
/// every request with status/elapsed time. This is the fix for "I get
//  an error on the frontend but see nothing on the backend": every
//  request now gets a span with request_id/method/path, and errors are
//  logged at error! level with full context.
pub async fn request_context_middleware(mut req: Request<Body>, next: Next) -> Response {
    let request_id = Uuid::new_v4();
    req.extensions_mut().insert(RequestId(request_id));

    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let start = Instant::now();

    let span = tracing::info_span!("request", %request_id, %method, %path);
    let mut response = next.run(req).instrument(span.clone()).await;

    let _enter = span.enter();
    let status = response.status();
    let elapsed_ms = start.elapsed().as_millis();
    if status.is_server_error() {
        tracing::error!(%status, elapsed_ms, "request failed");
    } else if status.is_client_error() {
        tracing::warn!(%status, elapsed_ms, "request rejected");
    } else {
        tracing::info!(%status, elapsed_ms, "request completed");
    }

    // Expose request ID in response header for frontend correlation.
    if let Ok(hv) = HeaderValue::from_str(&request_id.to_string()) {
        response.headers_mut().insert("x-request-id", hv);
    }
    response
}

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

/// Per-provider IP whitelist middleware for payment webhooks.
/// Extracts the provider code from the request path (e.g. /mpesa/...) and
/// validates against the provider-specific allowlist in config.
/// Empty allowlist = allow all (dev mode).
pub async fn provider_ip_whitelist_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request<Body>,
    next: Next,
) -> Result<Response, (StatusCode, String)> {
    let client_ip = extract_client_ip(&req).unwrap_or_else(|| "unknown".to_string());

    // Extract provider from path:
    // 1) /api/v1/payments/callbacks/{webhook} -> maps to "mpesa"
    // 2) /api/v1/payments/{provider}/{webhook} -> extracts provider code
    let path = req.uri().path();
    let provider = if path.contains("/callbacks/") {
        "mpesa"
    } else {
        path.split('/')
            .enumerate()
            .filter_map(|(i, s)| if i >= 4 { Some(s) } else { None }) // skip /api/v1/payments/
            .next()
            .unwrap_or("")
    };

    let allowed_ips = state.config.payments.webhook_ip_allowlist.get(provider);

    // #region debug-point H3:ip-whitelist-check
    tracing::info!(
        debug_session = "mpesa-deposit-balance",
        hypothesis = "H3",
        location = "middleware/mod.rs:provider_ip_whitelist_middleware",
        client_ip = %client_ip,
        provider = %provider,
        allowlist_configured = allowed_ips.is_some(),
        allowlist = ?allowed_ips,
        allowlist_empty = allowed_ips.map(|v| v.is_empty()).unwrap_or(true),
        msg = "[DEBUG] IP whitelist check for webhook callback"
    );
    // #endregion

    if !ip_is_allowed(&client_ip, allowed_ips.map(|v| v.as_slice()).unwrap_or(&[])) {
        // #region debug-point H3:ip-whitelist-blocked
        tracing::error!(
            debug_session = "mpesa-deposit-balance",
            hypothesis = "H3",
            location = "middleware/mod.rs:provider_ip_whitelist_middleware:blocked",
            client_ip = %client_ip,
            provider = %provider,
            http_status = %StatusCode::FORBIDDEN,
            msg = "[DEBUG] IP WHITELIST BLOCKED webhook callback — webhook will NOT process"
        );
        // #endregion
        tracing::warn!(
            "Rejected {} webhook from unauthorized IP: {}",
            provider, client_ip
        );
        return Err((
            StatusCode::FORBIDDEN,
            format!("Unauthorized IP: {}", client_ip),
        ));
    }

    // #region debug-point H3:ip-whitelist-passed
    tracing::info!(
        debug_session = "mpesa-deposit-balance",
        hypothesis = "H3",
        location = "middleware/mod.rs:provider_ip_whitelist_middleware:passed",
        client_ip = %client_ip,
        provider = %provider,
        msg = "[DEBUG] IP whitelist PASSED — webhook proceeding to handler"
    );
    // #endregion


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
