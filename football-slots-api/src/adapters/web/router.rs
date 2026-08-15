use axum::{
    middleware as axum_mw,
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::adapters::web::handlers::{admin, auth, bonus, game, health, mpesa, not_found, wallet};
use crate::adapters::web::middleware::{auth_middleware, ip_whitelist_middleware, RateLimiter};
use crate::config::Config;
use crate::domain::services::{
    bonus_service::BonusServiceImpl, game_engine::GameEngineImpl, mpesa_service::MpesaServiceImpl,
    rng::ProvablyFairRng, wallet_service::WalletServiceImpl,
};
use crate::ports::repositories::{
    GameRepository, MpesaRepository, UserRepository, WalletRepository,
};

/// Application state shared across all handlers.
pub struct AppState {
    pub user_repo: Arc<dyn UserRepository>,
    pub wallet_repo: Arc<dyn WalletRepository>,
    pub game_repo: Arc<dyn GameRepository>,
    pub mpesa_repo: Arc<dyn MpesaRepository>,
    pub game_engine: Arc<GameEngineImpl>,
    pub wallet_service: Arc<WalletServiceImpl>,
    pub mpesa_service: Arc<MpesaServiceImpl>,
    pub bonus_service: Arc<BonusServiceImpl>,
    pub rng: Arc<ProvablyFairRng>,
    pub rate_limiter: Arc<RateLimiter>,
    pub config: Config,
}

pub fn create_router(
    user_repo: Arc<dyn UserRepository>,
    wallet_repo: Arc<dyn WalletRepository>,
    game_repo: Arc<dyn GameRepository>,
    mpesa_repo: Arc<dyn MpesaRepository>,
    game_engine: Arc<GameEngineImpl>,
    wallet_service: Arc<WalletServiceImpl>,
    mpesa_service: Arc<MpesaServiceImpl>,
    bonus_service: Arc<BonusServiceImpl>,
    rng: Arc<ProvablyFairRng>,
    config: &Config,
) -> Router {
    let state = Arc::new(AppState {
        user_repo,
        wallet_repo,
        game_repo,
        mpesa_repo,
        game_engine,
        wallet_service,
        mpesa_service,
        bonus_service,
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

    // M-Pesa routes (authenticated): deposit & withdrawal initiation.
    let mpesa_auth_routes = Router::new()
        .route("/deposit", post(mpesa::initiate_deposit))
        .route("/withdraw", post(mpesa::initiate_withdrawal))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // M-Pesa callback routes (public webhooks): Safaricom posts to these.
    // Protected by IP whitelist middleware — only Safaricom IPs allowed in prod.
    let mpesa_callback_routes = Router::new()
        .route("/callback", post(mpesa::handle_callback))                        // STK Push
        .route("/b2c/result", post(mpesa::handle_b2c_result))                    // B2C withdrawal result
        .route("/b2c/timeout", post(mpesa::handle_b2c_timeout))                  // B2C withdrawal timeout
        .route("/c2b/confirmation", post(mpesa::handle_c2b_confirmation))        // C2B manual deposit
        .route("/c2b/validation", post(mpesa::handle_c2b_validation))            // C2B validation
        .route("/accountbalance/result", post(mpesa::handle_account_balance_result))  // Account balance result
        .route("/accountbalance/timeout", post(mpesa::handle_account_balance_timeout)) // Account balance timeout
        .route("/b2b/result", post(mpesa::handle_b2b_result))                    // B2B payment result
        .route("/b2b/timeout", post(mpesa::handle_b2b_timeout))                  // B2B payment timeout
        .route_layer(axum_mw::from_fn_with_state(
            state.clone(),
            ip_whitelist_middleware,
        ))
        .with_state(state.clone());

    let mpesa_routes = mpesa_auth_routes.merge(mpesa_callback_routes);

    // Admin routes (authenticated) — wallet investigation, reconciliation, M-Pesa ops
    let admin_routes = Router::new()
        .route("/wallets/reconcile", post(admin::reconcile_wallets))
        .route("/wallets/:user_id/ledger", get(admin::get_user_ledger))
        .route("/wallets/:wallet_id/freeze", post(admin::freeze_wallet))
        .route("/wallets/:wallet_id/unfreeze", post(admin::unfreeze_wallet))
        // M-Pesa Admin operations
        .route("/mpesa/account-balance/check", post(mpesa::trigger_account_balance_check))
        .route("/mpesa/account-balance/latest", get(mpesa::get_latest_account_balance))
        .route("/mpesa/reconcile", post(mpesa::trigger_reconciliation))
        .route("/mpesa/unmatched-deposits", get(mpesa::list_unmatched_deposits))
        .route("/mpesa/c2b/register", post(mpesa::register_c2b_urls))
        .route("/mpesa/pull/register", post(mpesa::register_pull_transactions))
        .route("/mpesa/b2b/pay", post(mpesa::initiate_business_pay_bill))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // Health checks
    let health_routes = Router::new()
        .route("/ready", get(health::ready))
        .route("/alive", get(health::alive));

    // Bonus routes (authenticated)
    let bonus_routes = Router::new()
        .route("/status", get(bonus::status))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    Router::new()
        .merge(health_routes)
        .nest("/api/v1/auth", auth_routes.merge(auth_protected_routes))
        .nest("/api/v1/game", game_routes.merge(game_public_routes))
        .nest("/api/v1/wallet", wallet_routes)
        .nest("/api/v1/mpesa", mpesa_routes)
        .nest("/api/v1/bonus", bonus_routes)
        .nest("/api/v1/admin", admin_routes)
        .fallback(not_found)
}
