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

    // Public base URL this server is reachable at. Used to build the
    // M-Pesa callback/result/timeout URLs Safaricom posts back to.
    // Point this at your ngrok/cloudflared tunnel in dev.
    pub app_base_url: String,

    // M-Pesa B2C (withdrawals). SecurityCredential is your initiator
    // password encrypted with Safaricom's public certificate -- generate
    // it once (offline, via the cert from the Daraja portal) and store the
    // resulting base64 string here. It is NOT the raw password.
    pub mpesa_initiator_name: String,
    pub mpesa_security_credential: Secret<String>,
    pub mpesa_b2c_shortcode: String,
    pub mpesa_b2c_url: String,

    // Real-money withdrawal limits (minor units). These are placeholder
    // defaults, not a compliance recommendation -- set them to whatever
    // your actual Safaricom B2C agreement and risk policy call for.
    pub real_min_withdrawal: i64,
    pub real_max_withdrawal: i64,
    pub daily_withdrawal_limit_minor: i64,

    // OTP
    pub otp_api_key: Option<Secret<String>>,
    pub otp_from_number: Option<String>,

    // Bonus meter
    pub bonus_meter_enabled: bool,
    pub bonus_meter_shadow: bool,
    pub bonus_meter_target: i32,
    pub bonus_meter_reward_minor: i64,
    pub bonus_meter_wager_multiplier: i32,
    pub bonus_min_stake: i64,
    pub bonus_max_stake: i64,
    pub bonus_grant_expiry_hours: i64,
    pub bonus_max_daily_grants_per_user: i64,
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
            app_base_url: std::env::var("APP_BASE_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            mpesa_initiator_name: std::env::var("MPESA_INITIATOR_NAME").unwrap_or_default(),
            mpesa_security_credential: Secret::from(
                std::env::var("MPESA_SECURITY_CREDENTIAL").unwrap_or_default(),
            ),
            mpesa_b2c_shortcode: std::env::var("MPESA_B2C_SHORTCODE").unwrap_or_default(),
            mpesa_b2c_url: std::env::var("MPESA_B2C_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest".to_string()
            }),
            real_min_withdrawal: std::env::var("REAL_MIN_WITHDRAWAL")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10_000), // KES 100
            real_max_withdrawal: std::env::var("REAL_MAX_WITHDRAWAL")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(7_000_000), // KES 70,000
            daily_withdrawal_limit_minor: std::env::var("DAILY_WITHDRAWAL_LIMIT_MINOR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(15_000_000), // KES 150,000
            otp_api_key: std::env::var("OTP_API_KEY").ok().map(Secret::from),
            otp_from_number: std::env::var("OTP_FROM_NUMBER").ok(),
            bonus_meter_enabled: std::env::var("BONUS_METER_ENABLED")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(false),
            bonus_meter_shadow: std::env::var("BONUS_METER_SHADOW")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(false),
            bonus_meter_target: std::env::var("BONUS_METER_TARGET")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(50),
            bonus_meter_reward_minor: std::env::var("BONUS_METER_REWARD_MINOR")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(1000),
            bonus_meter_wager_multiplier: std::env::var("BONUS_METER_WAGER_MULTIPLIER")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(5),
            bonus_min_stake: std::env::var("BONUS_MIN_STAKE")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(50),
            bonus_max_stake: std::env::var("BONUS_MAX_STAKE")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(500),
            bonus_grant_expiry_hours: std::env::var("BONUS_GRANT_EXPIRY_HOURS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(168),
            bonus_max_daily_grants_per_user: std::env::var("BONUS_MAX_DAILY_GRANTS_PER_USER")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(1),
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
