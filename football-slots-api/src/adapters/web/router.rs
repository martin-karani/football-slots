use axum::{
    middleware as axum_mw,
    routing::{get, post},
    Router,
};
use std::sync::Arc;

use crate::adapters::web::handlers::{auth, bonus, game, health, mpesa, not_found, wallet};
use crate::adapters::web::middleware::auth_middleware;
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
    /// Kept for the seed-hashing helpers still used elsewhere; the weighted
    /// draw itself (spin + verify) now calls `WeightedRng` directly rather
    /// than going through this trait object.
    pub rng: Arc<ProvablyFairRng>,
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
        config: config.clone(),
    });

    // Auth routes (public)
    let auth_routes = Router::new()
        .route("/send-otp", post(auth::send_otp))
        .route("/verify-otp", post(auth::verify_otp))
        .with_state(state.clone());

    // Auth routes (authenticated) – e.g. /auth/me
    let auth_protected_routes = Router::new()
        .route("/me", get(auth::me))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // Game routes (authenticated) – actions tied to a specific player
    let game_routes = Router::new()
        .route("/spin", post(game::spin))
        .route("/history", get(game::history))
        .route("/reveal-seed", get(game::reveal_seed))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .with_state(state.clone());

    // Game routes (PUBLIC, no auth) – provably-fair auditing must not
    // require an account. /verify lets anyone (including a player who
    // logged out, or a third-party auditor) recompute a spin from its
    // revealed seeds; /paytable publicly discloses the live multipliers
    // and win probabilities behind that computation.
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

    // M-Pesa routes (deposit/withdraw are authenticated, callbacks are public webhooks)
    let mpesa_routes = Router::new()
        .route("/deposit", post(mpesa::initiate_deposit))
        .route("/withdraw", post(mpesa::initiate_withdrawal))
        .route_layer(axum_mw::from_fn_with_state(state.clone(), auth_middleware))
        .route("/callback", post(mpesa::handle_callback)) // public webhook – no auth
        .route("/b2c/result", post(mpesa::handle_b2c_result)) // public webhook – no auth
        .route("/b2c/timeout", post(mpesa::handle_b2c_timeout)) // public webhook – no auth
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
        .fallback(not_found)
}
