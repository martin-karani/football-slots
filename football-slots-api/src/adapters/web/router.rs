use axum::{
    middleware as axum_mw,
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::adapters::payments::mpesa::MpesaAdapter;
use crate::adapters::web::handlers::{admin, auth, game, health, mpesa_admin, not_found, payments, wallet};
use crate::adapters::web::middleware::{auth_middleware, provider_ip_whitelist_middleware, request_context_middleware, RateLimiter};
use crate::config::Config;
use crate::domain::services::{
    game_engine::GameEngineImpl,
    payment_gateway::PaymentGateway,
    rng::ProvablyFairRng,
    wallet_service::WalletServiceImpl,
};
use crate::ports::repositories::{GameRepository, PaymentRepository, UserRepository, WalletRepository};

/// Application state shared across all handlers.
pub struct AppState {
    pub user_repo: Arc<dyn UserRepository>,
    pub wallet_repo: Arc<dyn WalletRepository>,
    pub game_repo: Arc<dyn GameRepository>,
    pub payment_repo: Arc<dyn PaymentRepository>,
    pub payment_gateway: Arc<PaymentGateway>,
    pub mpesa_adapter: Arc<MpesaAdapter>,
    pub game_engine: Arc<GameEngineImpl>,
    pub wallet_service: Arc<WalletServiceImpl>,
    pub rng: Arc<ProvablyFairRng>,
    pub rate_limiter: Arc<RateLimiter>,
    pub config: Config,
}

pub fn create_router(
    user_repo: Arc<dyn UserRepository>,
    wallet_repo: Arc<dyn WalletRepository>,
    game_repo: Arc<dyn GameRepository>,
    payment_repo: Arc<dyn PaymentRepository>,
    payment_gateway: Arc<PaymentGateway>,
    mpesa_adapter: Arc<MpesaAdapter>,
    game_engine: Arc<GameEngineImpl>,
    wallet_service: Arc<WalletServiceImpl>,
    rng: Arc<ProvablyFairRng>,
    config: &Config,
) -> Router {
    let state = Arc::new(AppState {
        user_repo,
        wallet_repo,
        game_repo,
        payment_repo,
        payment_gateway,
        mpesa_adapter,
        game_engine,
        wallet_service,
        rng,
        rate_limiter: Arc::new(RateLimiter::new()),
        config: config.clone(),
    });

    // Auth routes (public)
    let auth_routes = Router::new()
        .route("/send-otp", post(auth::send_otp))
        .route("/verify-otp", post(auth::verify_otp))
        .with_state(state.clone());

    // Auth routes (authenticated)
    let auth_protected_routes = Router::new()
        .route("/me", get(auth::me))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // Game routes (authenticated)
    let game_routes = Router::new()
        .route("/spin", post(game::spin))
        .route("/history", get(game::history))
        .route("/reveal-seed", get(game::reveal_seed))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // Game routes (PUBLIC) — provably-fair auditing
    let game_public_routes = Router::new()
        .route("/verify", post(game::verify))
        .route("/paytable", get(game::paytable))
        .with_state(state.clone());

    // Wallet routes (authenticated)
    let wallet_routes = Router::new()
        .route("/balance", get(wallet::balance))
        .route("/ledger", get(wallet::ledger))
        .route("/topup-virtual", post(wallet::topup_virtual))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // ── Payment routes (authenticated): deposit & withdrawal initiation ──
    let payments_auth_routes = Router::new()
        .route("/deposit", post(payments::initiate_deposit))
        .route("/withdraw", post(payments::initiate_withdrawal))
        .route("/providers", get(payments::list_providers))
        .route("/history", get(payments::history))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // ── Payment webhook routes (public) — provider callbacks ──
    // Protected by per-provider IP whitelist middleware.
    let payments_webhook_routes = Router::new()
        .route("/{provider}/{webhook}", post(payments::provider_webhook))
        .route_layer(axum_mw::from_fn_with_state(
            state.clone(),
            provider_ip_whitelist_middleware,
        ))
        .with_state(state.clone());

    let payments_routes = payments_auth_routes.merge(payments_webhook_routes);

    // Admin routes (authenticated) — wallet investigation, reconciliation, M-Pesa ops
    let admin_routes = Router::new()
        .route("/wallets/reconcile", post(admin::reconcile_wallets))
        .route("/wallets/:user_id/ledger", get(admin::get_user_ledger))
        .route("/wallets/:wallet_id/freeze", post(admin::freeze_wallet))
        .route("/wallets/:wallet_id/unfreeze", post(admin::unfreeze_wallet))
        .with_state(state.clone());

    // M-Pesa admin operations
    let mpesa_admin_routes = Router::new()
        .route("/account-balance/check", post(mpesa_admin::trigger_account_balance_check))
        .route("/account-balance/latest", get(mpesa_admin::get_latest_account_balance))
        .route("/reconcile", post(mpesa_admin::trigger_reconciliation))
        .route("/unmatched-deposits", get(mpesa_admin::list_unmatched_deposits))
        .route("/unmatched-deposits/:deposit_id/resolve", post(mpesa_admin::resolve_unmatched_deposit))
        .route("/c2b/register", post(mpesa_admin::register_c2b_urls))
        .route("/pull/register", post(mpesa_admin::register_pull_transactions))
        .route("/b2b/pay", post(mpesa_admin::initiate_business_pay_bill))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    let admin_merged = admin_routes.nest("/payments/mpesa", mpesa_admin_routes);

    // Health checks
    let health_routes = Router::new()
        .route("/ready", get(health::ready))
        .route("/alive", get(health::alive));

    Router::new()
        .merge(health_routes)
        .nest("/api/v1/auth", auth_routes.merge(auth_protected_routes))
        .nest("/api/v1/game", game_routes.merge(game_public_routes))
        .nest("/api/v1/wallet", wallet_routes)
        .nest("/api/v1/payments", payments_routes)
        .nest("/api/v1/admin", admin_merged)
        .fallback(not_found)
        // Global middleware: every request gets a request ID + tracing span + status logging.
        .layer(axum_mw::from_fn_with_state(state.clone(), request_context_middleware))
}
