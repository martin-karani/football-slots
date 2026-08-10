use std::sync::Arc;

use anyhow::Context;
use football_slots_api::{
    adapters::{
        persistence::repositories::{
            PgGameRepository, PgMpesaRepository, PgUserRepository, PgWalletRepository,
        },
        web::router::create_router,
    },
    config::Config,
    domain::services::{
        game_engine::GameEngineImpl,
        mpesa_service::MpesaServiceImpl,
        rng::ProvablyFairRng,
        wallet_service::WalletServiceImpl,
    },
};
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Config::from_env().context("Failed to load configuration")?;
    tracing::info!("Starting Football Slots API on {}:{}", config.host, config.port);

    // Initialize database pool
    let pool = PgPool::connect(&config.database_url)
        .await
        .context("Failed to connect to database")?;

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("Failed to run migrations")?;
    tracing::info!("Database migrations applied");

    // Create adapters
    let user_repo = Arc::new(PgUserRepository::new(pool.clone()));
    let wallet_repo = Arc::new(PgWalletRepository::new(pool.clone()));
    let game_repo = Arc::new(PgGameRepository::new(pool.clone()));
    let mpesa_repo = Arc::new(PgMpesaRepository::new(pool.clone()));

    // Create domain services
    let rng = Arc::new(ProvablyFairRng::new());
    let game_engine = Arc::new(GameEngineImpl::new(game_repo.clone(), wallet_repo.clone()));
    let wallet_service = Arc::new(WalletServiceImpl::new(wallet_repo.clone()));
    let mpesa_service = Arc::new(MpesaServiceImpl::new(
        mpesa_repo.clone(),
        wallet_repo.clone(),
        user_repo.clone(),
        config.clone(),
    ));

    // Build router
    let app = create_router(
        user_repo,
        wallet_repo,
        game_repo,
        mpesa_repo,
        game_engine,
        wallet_service,
        mpesa_service,
        rng,
        &config,
    );

    // Add CORS with configured frontend URL
    let app = app.layer(
        CorsLayer::new()
            .allow_origin(tower_http::cors::Any)
            .allow_methods(tower_http::cors::Any)
            .allow_headers(tower_http::cors::Any),
    );

    // Start server
    let listener = tokio::net::TcpListener::bind(format!("{}:{}", config.host, config.port))
        .await
        .context("Failed to bind to address")?;

    tracing::info!("🏈 Football Slots API listening on {}:{}", config.host, config.port);
    axum::serve(listener, app)
        .await
        .context("Server error")?;

    Ok(())
}
