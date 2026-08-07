use secrecy::Secret;
use std::fmt;



#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: Secret<String>,
    pub port: u16,
    pub host: String,

    // Virtual currency defaults (in minor units = cents)
    pub virtual_initial_balance: i64,
    pub bonus_initial_balance: i64,

    // Wagering limits
    pub real_min_stake: i64,
    pub real_max_stake: i64,
    pub virtual_min_stake: i64,
    pub virtual_max_stake: i64,

    // M-Pesa
    pub mpesa_consumer_key: String,
    pub mpesa_consumer_secret: Secret<String>,
    pub mpesa_passkey: String,
    pub mpesa_shortcode: String,
    pub mpesa_lipa_url: String,
    pub mpesa_base_url: String,

    // OTP
    pub otp_api_key: Option<Secret<String>>,
    pub otp_from_number: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, anyhow::Error> {
        dotenvy::dotenv().ok();

        Ok(Config {
            database_url: std::env::var("DATABASE_URL")?,
            jwt_secret: Secret::from(std::env::var("JWT_SECRET")?),
            port: std::env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(3000),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            virtual_initial_balance: std::env::var("VIRTUAL_INITIAL_BALANCE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100000),
            bonus_initial_balance: std::env::var("BONUS_INITIAL_BALANCE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50000),
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
            mpesa_consumer_key: std::env::var("MPESA_CONSUMER_KEY").unwrap_or_default(),
            mpesa_consumer_secret: Secret::from(std::env::var("MPESA_CONSUMER_SECRET").unwrap_or_default()),
            mpesa_passkey: std::env::var("MPESA_PASSKEY").unwrap_or_default(),
            mpesa_shortcode: std::env::var("MPESA_SHORTCODE").unwrap_or_default(),
            mpesa_lipa_url: std::env::var("MPESA_LIPA_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest".to_string()
            }),
            mpesa_base_url: std::env::var("MPESA_BASE_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke".to_string()
            }),
            otp_api_key: std::env::var("OTP_API_KEY").ok().map(Secret::from),
            otp_from_number: std::env::var("OTP_FROM_NUMBER").ok(),
        })
    }
}

impl fmt::Display for Config {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Config {{ host: {}, port: {}, db: {}... }}",
            self.host,
            self.port,
            &self.database_url[..self.database_url.len().min(30)]
        )
    }
}
