use secrecy::Secret;
use std::collections::HashMap;
use std::fmt;

/// Server-controlled payment currency. Never accepted from a client request.
pub const PAYMENT_CURRENCY: &str = "KES";

#[derive(Debug, Clone)]
pub struct MpesaConfig {
    pub enabled: bool,
    pub consumer_key: String,
    pub consumer_secret: Secret<String>,
    pub passkey: String,
    pub shortcode: String,
    pub lipa_url: String,
    pub base_url: String,
    pub initiator_name: String,
    pub security_credential: Secret<String>,
    pub b2c_shortcode: String,
    pub b2c_url: String,
    pub c2b_register_url: String,
    pub pull_register_url: String,
    pub pull_query_url: String,
    pub b2b_url: String,
    pub nominated_number: String,
    pub account_balance_url: String,
    pub callback_allowed_ips: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct AirtelConfig {
    pub enabled: bool,
    pub base_url: String,
    pub client_id: String,
    pub client_secret: Secret<String>,
    pub callback_allowed_ips: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct PaymentsConfig {
    pub deposit_rate_limit_seconds: u64,
    pub daily_deposit_limit_minor: i64,
    pub min_withdrawal_minor: i64,
    pub max_withdrawal_minor: i64,
    pub daily_withdrawal_limit_minor: i64,
    pub payment_currency: String,
    pub mpesa: MpesaConfig,
    pub airtel: Option<AirtelConfig>,
    /// provider code → callback IP allowlist (built from each provider config).
    pub webhook_ip_allowlist: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: Secret<String>,
    pub port: u16,
    pub host: String,

    // Virtual currency defaults (in minor units = cents)
    pub virtual_initial_balance: i64,

    // Wagering limits
    pub real_min_stake: i64,
    pub real_max_stake: i64,
    pub virtual_min_stake: i64,
    pub virtual_max_stake: i64,

    // Public base URL this server is reachable at. Used to build the
    // provider callback/result/timeout URLs.
    pub app_base_url: String,

    // OTP
    pub otp_api_key: Option<Secret<String>>,
    pub otp_from_number: Option<String>,

    // Payment configuration
    pub payments: PaymentsConfig,
}

impl Config {
    pub fn from_env() -> Result<Self, anyhow::Error> {
        dotenvy::dotenv().ok();

        let mpesa_enabled = std::env::var("MPESA_ENABLED")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(true);

        let mpesa_config = MpesaConfig {
            enabled: mpesa_enabled,
            consumer_key: std::env::var("MPESA_CONSUMER_KEY").unwrap_or_default(),
            consumer_secret: Secret::from(std::env::var("MPESA_CONSUMER_SECRET").unwrap_or_default()),
            passkey: std::env::var("MPESA_PASSKEY").unwrap_or_default(),
            shortcode: std::env::var("MPESA_SHORTCODE").unwrap_or_default(),
            lipa_url: std::env::var("MPESA_LIPA_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest".to_string()
            }),
            base_url: std::env::var("MPESA_BASE_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke".to_string()
            }),
            initiator_name: std::env::var("MPESA_INITIATOR_NAME").unwrap_or_default(),
            security_credential: Secret::from(
                std::env::var("MPESA_SECURITY_CREDENTIAL").unwrap_or_default(),
            ),
            b2c_shortcode: std::env::var("MPESA_B2C_SHORTCODE").unwrap_or_default(),
            b2c_url: std::env::var("MPESA_B2C_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest".to_string()
            }),
            c2b_register_url: std::env::var("MPESA_C2B_REGISTER_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/c2b/v2/registerurl".to_string()
            }),
            pull_register_url: std::env::var("MPESA_PULL_REGISTER_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/pulltransactions/v1/register".to_string()
            }),
            pull_query_url: std::env::var("MPESA_PULL_QUERY_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/pulltransactions/v1/query".to_string()
            }),
            b2b_url: std::env::var("MPESA_B2B_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/b2b/v1/paymentrequest".to_string()
            }),
            nominated_number: std::env::var("MPESA_NOMINATED_NUMBER").unwrap_or_default(),
            account_balance_url: std::env::var("MPESA_ACCOUNT_BALANCE_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/accountbalance/v1/query".to_string()
            }),
            callback_allowed_ips: std::env::var("MPESA_CALLBACK_ALLOWED_IPS")
                .ok()
                .filter(|s| !s.is_empty())
                .map(|s| s.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default(),
        };

        let mut webhook_ip_allowlist = HashMap::new();
        if mpesa_enabled {
            webhook_ip_allowlist.insert("mpesa".to_string(), mpesa_config.callback_allowed_ips.clone());
        }

        let payments = PaymentsConfig {
            deposit_rate_limit_seconds: std::env::var("DEPOSIT_RATE_LIMIT_SECONDS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
            daily_deposit_limit_minor: std::env::var("DAILY_DEPOSIT_LIMIT_MINOR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50_000_000),
            min_withdrawal_minor: std::env::var("REAL_MIN_WITHDRAWAL")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10_000),
            max_withdrawal_minor: std::env::var("REAL_MAX_WITHDRAWAL")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(7_000_000),
            daily_withdrawal_limit_minor: std::env::var("DAILY_WITHDRAWAL_LIMIT_MINOR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(15_000_000),
            payment_currency: std::env::var("PAYMENT_CURRENCY")
                .ok()
                .unwrap_or_else(|| PAYMENT_CURRENCY.to_string()),
            mpesa: mpesa_config,
            airtel: None, // Add when Airtel is implemented
            webhook_ip_allowlist,
        };

        Ok(Config {
            database_url: std::env::var("DATABASE_URL")?,
            jwt_secret: Secret::from(std::env::var("JWT_SECRET")?),
            port: std::env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(3000),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            virtual_initial_balance: std::env::var("VIRTUAL_INITIAL_BALANCE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100000),
            real_min_stake: std::env::var("REAL_MIN_STAKE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50),
            real_max_stake: std::env::var("REAL_MAX_STAKE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(500000),
            virtual_min_stake: std::env::var("VIRTUAL_MIN_STAKE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1),
            virtual_max_stake: std::env::var("VIRTUAL_MAX_STAKE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1000000),
            app_base_url: std::env::var("APP_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            otp_api_key: std::env::var("OTP_API_KEY").ok().map(Secret::from),
            otp_from_number: std::env::var("OTP_FROM_NUMBER").ok(),
            payments,
        })
    }
}

impl fmt::Display for Config {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Config {{ host: {}, port: {}, db: {}... }}",
            self.host,
            self.port,
            &self.database_url[..12]
        )
    }
}
