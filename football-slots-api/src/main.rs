use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Context;
use football_slots_api::{
    adapters::{
        notifications::celcom_sms::CelcomAfricaSmsGateway,
        notifications::smtp_mailer::SmtpMailer,
        payments::mpesa::MpesaAdapter,
        persistence::{
            payment_repository::{PgMpesaOpsRepository, PgPaymentRepository},
            repositories::{PgGameRepository, PgUserRepository, PgWalletRepository},
        },
        web::router::create_router,
    },
    config::Config,
    domain::models::payment::PaymentProvider,
    domain::services::{
        game_engine::GameEngineImpl,
        payment_gateway::PaymentGateway,
        rng::ProvablyFairRng,
        wallet_service::WalletServiceImpl,
    },
    ports::{
        payments::PaymentProviderPort,
        repositories::{MpesaOpsRepository, PaymentRepository},
    },
};
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env().context("Failed to load configuration")?;
    

    let pool = PgPool::connect(&config.database_url)
        .await
        .context("Failed to connect to database")?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .context("Failed to run migrations")?;
    

    let user_repo = Arc::new(PgUserRepository::new(pool.clone()));
    let wallet_repo = Arc::new(PgWalletRepository::new(pool.clone()));
    let game_repo = Arc::new(PgGameRepository::new(pool.clone()));
    let payment_repo: Arc<dyn PaymentRepository> = Arc::new(PgPaymentRepository::new(pool.clone()));
    let mpesa_ops_repo: Arc<dyn MpesaOpsRepository> = Arc::new(PgMpesaOpsRepository::new(pool.clone()));

    let rng = Arc::new(ProvablyFairRng::new());
    let game_engine = Arc::new(GameEngineImpl::new(
        game_repo.clone(),
        wallet_repo.clone(),
    ));
    let wallet_service = Arc::new(WalletServiceImpl::new(wallet_repo.clone()));

    let mpesa_adapter = Arc::new(MpesaAdapter::new(
        config.payments.mpesa.clone(),
        config.app_base_url.clone(),
        payment_repo.clone(),
        mpesa_ops_repo.clone(),
        user_repo.clone(),
    ));

    let mut adapters: HashMap<PaymentProvider, Arc<dyn PaymentProviderPort>> = HashMap::new();
    if config.payments.mpesa.enabled {
        adapters.insert(PaymentProvider::Mpesa, mpesa_adapter.clone());
    }

    let payment_gateway = Arc::new(PaymentGateway::new(
        payment_repo.clone(),
        wallet_repo.clone(),
        user_repo.clone(),
        adapters,
        config.clone(),
    ));

    let email_gateway: Arc<dyn football_slots_api::ports::notifications::EmailGatewayPort> =
        Arc::new(SmtpMailer::new(config.smtp.clone()));
    let sms_gateway: Arc<dyn football_slots_api::ports::notifications::SmsGatewayPort> =
        Arc::new(CelcomAfricaSmsGateway::new(config.sms.clone()));

    let app = create_router(
        user_repo,
        wallet_repo,
        game_repo,
        payment_repo,
        payment_gateway,
        mpesa_adapter,
        game_engine,
        wallet_service,
        rng,
        email_gateway,
        sms_gateway,
        &config,
    );

    let app = app.layer(
        CorsLayer::new()
            .allow_origin(tower_http::cors::Any)
            .allow_methods(tower_http::cors::Any)
            .allow_headers(tower_http::cors::Any),
    );

    let listener = tokio::net::TcpListener::bind(format!("{}:{}", config.host, config.port))
        .await
        .context("Failed to bind to address")?;

    
    tracing::info!("🏈 Football Slots API listening on {}:{}", config.host, config.port);
    axum::serve(listener, app)
        .await
        .context("Server error")?;

    Ok(())
}
