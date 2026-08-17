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
    pub app_base_url: String,

    // M-Pesa B2C (withdrawals). SecurityCredential is your initiator
    // password encrypted with Safaricom's public certificate.
    pub mpesa_initiator_name: String,
    pub mpesa_security_credential: Secret<String>,
    pub mpesa_b2c_shortcode: String,
    pub mpesa_b2c_url: String,

    // M-Pesa C2B (manual Paybill deposits)
    pub mpesa_c2b_register_url: String,

    // M-Pesa Pull Transactions (reconciliation)
    pub mpesa_pull_register_url: String,
    pub mpesa_pull_query_url: String,

    // M-Pesa B2B (Business Pay Bill)
    pub mpesa_b2b_url: String,

    // Nominated number for Pull Transactions registration.
    // This is the Safaricom MSISDN associated with the organization account.
    pub mpesa_nominated_number: String,

    // M-Pesa Account Balance API
    pub mpesa_account_balance_url: String,

    // Real-money withdrawal limits (minor units).
    pub real_min_withdrawal: i64,
    pub real_max_withdrawal: i64,
    pub daily_withdrawal_limit_minor: i64,

    // OTP
    pub otp_api_key: Option<Secret<String>>,
    pub otp_from_number: Option<String>,

    // Security: IP whitelisting for M-Pesa callbacks.
    // Comma-separated exact IPs or CIDR ranges. Empty = allow all (dev only).
    pub mpesa_callback_allowed_ips: Vec<String>,

    // Security: rate limiting for M-Pesa STK push.
    pub deposit_rate_limit_seconds: u64,

    // Daily deposit limit (minor units).
    pub daily_deposit_limit_minor: i64,
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
                .ok().and_then(|v| v.parse().ok()).unwrap_or(100000),
            real_min_stake: std::env::var("REAL_MIN_STAKE")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(50),
            real_max_stake: std::env::var("REAL_MAX_STAKE")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(500000),
            virtual_min_stake: std::env::var("VIRTUAL_MIN_STAKE")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(1),
            virtual_max_stake: std::env::var("VIRTUAL_MAX_STAKE")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(1000000),
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
                "https://sandbox.safaricom.co.ke/mpesa/b2c/v3/paymentrequest".to_string()
            }),
            // C2B Register URLs
            mpesa_c2b_register_url: std::env::var("MPESA_C2B_REGISTER_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/c2b/v2/registerurl".to_string()
            }),
            // Pull Transactions
            mpesa_pull_register_url: std::env::var("MPESA_PULL_REGISTER_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/pulltransactions/v1/register".to_string()
            }),
            mpesa_pull_query_url: std::env::var("MPESA_PULL_QUERY_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/pulltransactions/v1/query".to_string()
            }),
            // B2B Business Pay Bill
            mpesa_b2b_url: std::env::var("MPESA_B2B_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/b2b/v1/paymentrequest".to_string()
            }),
            // Nominated number (MSISDN associated with the shortcode)
            mpesa_nominated_number: std::env::var("MPESA_NOMINATED_NUMBER").unwrap_or_default(),
            // Account Balance
            mpesa_account_balance_url: std::env::var("MPESA_ACCOUNT_BALANCE_URL").unwrap_or_else(|_| {
                "https://sandbox.safaricom.co.ke/mpesa/accountbalance/v1/query".to_string()
            }),
            real_min_withdrawal: std::env::var("REAL_MIN_WITHDRAWAL")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(10_000),
            real_max_withdrawal: std::env::var("REAL_MAX_WITHDRAWAL")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(7_000_000),
            daily_withdrawal_limit_minor: std::env::var("DAILY_WITHDRAWAL_LIMIT_MINOR")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(15_000_000),
            otp_api_key: std::env::var("OTP_API_KEY").ok().map(Secret::from),
            otp_from_number: std::env::var("OTP_FROM_NUMBER").ok(),

            // Security: IP whitelist for M-Pesa callbacks.
            // Safaricom production callback IPs (exact list from Daraja docs).
            mpesa_callback_allowed_ips: std::env::var("MPESA_CALLBACK_ALLOWED_IPS")
                .ok()
                .filter(|s| !s.is_empty())
                .map(|s| s.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default(),

            deposit_rate_limit_seconds: std::env::var("DEPOSIT_RATE_LIMIT_SECONDS")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(30),

            daily_deposit_limit_minor: std::env::var("DAILY_DEPOSIT_LIMIT_MINOR")
                .ok().and_then(|v| v.parse().ok()).unwrap_or(50_000_000),
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