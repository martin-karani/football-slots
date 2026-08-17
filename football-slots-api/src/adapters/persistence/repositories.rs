use async_trait::async_trait;
use sqlx::Row;
use uuid::Uuid;

use crate::adapters::persistence::postgres::PgPool;
use crate::domain::models::{
    errors::{DomainError, DomainResult},
    game::GameRound,
    user::{CreateUserRequest, KycStatus, User},
    wallet::{CurrencyType, LedgerEntryType, Wallet, WalletLedgerEntry},
};
use crate::ports::repositories::*;

// ============================================================
// User Repository
// ============================================================

pub struct PgUserRepository {
    pool: PgPool,
}

impl PgUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn create(&self, req: &CreateUserRequest) -> DomainResult<User> {
        let user: User = sqlx::query_as(
            r#"INSERT INTO users (phone_number, display_name) VALUES ($1, $2)
               RETURNING id, phone_number, display_name, kyc_status, date_of_birth,
               self_excluded_until, daily_deposit_limit_minor, daily_withdrawal_limit_minor,
               created_at, updated_at"#,
        )
        .bind(&req.phone_number)
        .bind(req.display_name.as_deref())
        .fetch_one(&self.pool)
        .await?;
        Ok(user)
    }

    async fn find_by_id(&self, id: Uuid) -> DomainResult<Option<User>> {
        let user: Option<User> = sqlx::query_as(
            r#"SELECT id, phone_number, display_name, kyc_status, date_of_birth,
               self_excluded_until, daily_deposit_limit_minor, daily_withdrawal_limit_minor,
               created_at, updated_at
               FROM users WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(user)
    }

    async fn find_by_phone(&self, phone: &str) -> DomainResult<Option<User>> {
        let user: Option<User> = sqlx::query_as(
            r#"SELECT id, phone_number, display_name, kyc_status, date_of_birth,
               self_excluded_until, daily_deposit_limit_minor, daily_withdrawal_limit_minor,
               created_at, updated_at
               FROM users WHERE phone_number = $1"#,
        )
        .bind(phone)
        .fetch_optional(&self.pool)
        .await?;
        Ok(user)
    }

    async fn update_kyc_status(&self, id: Uuid, status: KycStatus) -> DomainResult<User> {
        let user: User = sqlx::query_as(
            r#"UPDATE users SET kyc_status = $1::kyc_status, updated_at = now()
               WHERE id = $2
               RETURNING id, phone_number, display_name, kyc_status, date_of_birth,
               self_excluded_until, daily_deposit_limit_minor, daily_withdrawal_limit_minor,
               created_at, updated_at"#,
        )
        .bind(status)
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        Ok(user)
    }

    async fn update_self_exclusion(
        &self,
        id: Uuid,
        until: Option<chrono::DateTime<chrono::Utc>>,
    ) -> DomainResult<User> {
        let user: User = sqlx::query_as(
            r#"UPDATE users SET self_excluded_until = $1, updated_at = now()
               WHERE id = $2
               RETURNING id, phone_number, display_name, kyc_status, date_of_birth,
               self_excluded_until, daily_deposit_limit_minor, daily_withdrawal_limit_minor,
               created_at, updated_at"#,
        )
        .bind(until)
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        Ok(user)
    }

    async fn get_or_create_by_phone(&self, phone: &str) -> DomainResult<User> {
        if let Some(user) = self.find_by_phone(phone).await? {
            return Ok(user);
        }
        self.create(&CreateUserRequest {
            phone_number: phone.to_string(),
            display_name: None,
        })
        .await
    }

    async fn store_otp(&self, phone: &str, code_hash: &str, expires_at: chrono::DateTime<chrono::Utc>) -> DomainResult<()> {
        // Invalidate any existing unused codes for this phone
        sqlx::query(
            r#"UPDATE otp_codes SET used = TRUE WHERE phone_number = $1 AND NOT used AND expires_at > now()"#,
        )
        .bind(phone)
        .execute(&self.pool)
        .await?;

        // Insert the new OTP code
        sqlx::query(
            r#"INSERT INTO otp_codes (phone_number, code_hash, expires_at) VALUES ($1, $2, $3)"#,
        )
        .bind(phone)
        .bind(code_hash)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        tracing::info!(phone = %phone, "OTP code stored in database");
        Ok(())
    }

    async fn verify_and_consume_otp(&self, phone: &str, code: &str) -> DomainResult<bool> {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(code.as_bytes());
        let code_hash = hex::encode(hasher.finalize());

        // Find the most recent unused, unexpired OTP for this phone and mark it as used.
        // PostgreSQL doesn't support ORDER BY in UPDATE, so we use a CTE.
        let row: Option<(String,)> = sqlx::query_as(
            r#"WITH target AS (
                   SELECT id, code_hash FROM otp_codes
                   WHERE phone_number = $1 AND code_hash = $2 AND NOT used AND expires_at > now()
                   ORDER BY created_at DESC LIMIT 1
               )
               UPDATE otp_codes SET used = TRUE
               FROM target WHERE otp_codes.id = target.id
               RETURNING otp_codes.code_hash"#,
        )
        .bind(phone)
        .bind(&code_hash)
        .fetch_optional(&self.pool)
        .await?;

        let valid = row.is_some();
        if valid {
            tracing::info!(phone = %phone, "OTP code verified successfully");
        } else {
            tracing::warn!(phone = %phone, "OTP code verification failed (wrong code or expired)");
        }
        Ok(valid)
    }
}

// ============================================================
// Wallet Repository
// ============================================================

pub struct PgWalletRepository {
    pool: PgPool,
}

impl PgWalletRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn insert_ledger_entry(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        wallet_id: Uuid,
        entry_type: LedgerEntryType,
        amount_minor: i64,
        balance_after_minor: i64,
        reference_type: Option<String>,
        reference_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> DomainResult<()> {
        sqlx::query(
            r#"INSERT INTO wallet_ledger (wallet_id, entry_type, amount_minor, balance_after_minor,
               reference_type, reference_id, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        )
        .bind(wallet_id)
        .bind(entry_type.to_string())
        .bind(amount_minor)
        .bind(balance_after_minor)
        .bind(reference_type)
        .bind(reference_id)
        .bind(metadata)
        .execute(&mut **tx)
        .await?;

        Ok(())
    }
}

#[async_trait]
impl WalletRepository for PgWalletRepository {
    async fn get_or_create(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<Wallet> {
        let initial_balance = if currency == CurrencyType::Virtual {
            100000i64
        } else {
            0i64
        };
        tracing::debug!(
            user_id = %user_id,
            currency = ?currency,
            initial_balance,
            "Wallet get_or_create"
        );
        let wallet: Wallet = sqlx::query_as(
            r#"INSERT INTO wallets (user_id, currency, balance_minor) VALUES ($1, $2::currency_type, $3)
               ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = now()
               RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
        )
        .bind(user_id)
        .bind(currency)
        .bind(initial_balance)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            tracing::error!(
                user_id = %user_id,
                currency = ?currency,
                error = %e,
                "Failed to get or create wallet"
            );
            DomainError::Database(e)
        })?;
        tracing::debug!(
            wallet_id = %wallet.id,
            balance = wallet.balance_minor,
            "Wallet retrieved or created"
        );
        Ok(wallet)
    }

    async fn topup_virtual(&self, user_id: Uuid) -> DomainResult<Wallet> {
        let wallet = self.get_or_create(user_id, CurrencyType::Virtual).await?;
        let refill_amount = 100000i64;
        self.credit(
            wallet.id,
            refill_amount,
            LedgerEntryType::Deposit,
            Some("virtual_refill".to_string()),
            None,
            None,
        )
        .await
    }

    async fn find_by_id(&self, id: Uuid) -> DomainResult<Option<Wallet>> {
        let w: Option<Wallet> = sqlx::query_as(
            r#"SELECT id, user_id, currency, balance_minor, is_frozen, created_at, updated_at
               FROM wallets WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(w)
    }

    async fn get_balance(&self, user_id: Uuid, currency: CurrencyType) -> DomainResult<i64> {
        let wallet = self.get_or_create(user_id, currency).await?;
        Ok(wallet.balance_minor)
    }

    async fn debit(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        entry_type: LedgerEntryType,
        reference_type: Option<String>,
        reference_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> DomainResult<Wallet> {
        let mut tx = self.pool.begin().await?;

        let wallet: Wallet = sqlx::query_as(
            r#"UPDATE wallets SET balance_minor = balance_minor - $1, updated_at = now()
               WHERE id = $2 AND balance_minor >= $1 AND NOT is_frozen
               RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
        )
        .bind(amount_minor)
        .bind(wallet_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| DomainError::InsufficientBalance)?;

        Self::insert_ledger_entry(
            &mut tx,
            wallet_id,
            entry_type,
            -amount_minor,
            wallet.balance_minor,
            reference_type,
            reference_id,
            metadata,
        )
        .await?;

        tx.commit().await?;
        Ok(wallet)
    }

    async fn credit(
        &self,
        wallet_id: Uuid,
        amount_minor: i64,
        entry_type: LedgerEntryType,
        reference_type: Option<String>,
        reference_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> DomainResult<Wallet> {
        let mut tx = self.pool.begin().await?;

        let wallet: Wallet = sqlx::query_as(
            r#"UPDATE wallets SET balance_minor = balance_minor + $1, updated_at = now()
               WHERE id = $2
               RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
        )
        .bind(amount_minor)
        .bind(wallet_id)
        .fetch_one(&mut *tx)
        .await?;

        Self::insert_ledger_entry(
            &mut tx,
            wallet_id,
            entry_type,
            amount_minor,
            wallet.balance_minor,
            reference_type,
            reference_id,
            metadata,
        )
        .await?;

        tx.commit().await?;
        Ok(wallet)
    }

    async fn settle_atomic(
        &self,
        wallet_id: Uuid,
        debit: Option<(i64, LedgerEntryType)>,
        credit: Option<(i64, LedgerEntryType)>,
        reference_type: Option<String>,
        reference_id: Option<Uuid>,
        metadata: Option<serde_json::Value>,
    ) -> DomainResult<Wallet> {
        let mut tx = self.pool.begin().await?;
        let mut wallet = self
            .find_by_id(wallet_id)
            .await?
            .ok_or(DomainError::WalletNotFound)?;

        if let Some((amount_minor, entry_type)) = debit {
            wallet = sqlx::query_as(
                r#"UPDATE wallets SET balance_minor = balance_minor - $1, updated_at = now()
                   WHERE id = $2 AND balance_minor >= $1 AND NOT is_frozen
                   RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
            )
            .bind(amount_minor)
            .bind(wallet_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| DomainError::InsufficientBalance)?;

            Self::insert_ledger_entry(
                &mut tx,
                wallet_id,
                entry_type,
                -amount_minor,
                wallet.balance_minor,
                reference_type.clone(),
                reference_id,
                metadata.clone(),
            )
            .await?;
        }

        if let Some((amount_minor, entry_type)) = credit {
            wallet = sqlx::query_as(
                r#"UPDATE wallets SET balance_minor = balance_minor + $1, updated_at = now()
                   WHERE id = $2
                   RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
            )
            .bind(amount_minor)
            .bind(wallet_id)
            .fetch_one(&mut *tx)
            .await?;

            Self::insert_ledger_entry(
                &mut tx,
                wallet_id,
                entry_type,
                amount_minor,
                wallet.balance_minor,
                reference_type,
                reference_id,
                metadata,
            )
            .await?;
        }

        tx.commit().await?;
        Ok(wallet)
    }

    async fn get_ledger_entries(
        &self,
        wallet_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<WalletLedgerEntry>> {
        let rows: Vec<WalletLedgerEntry> = sqlx::query_as(
            r#"SELECT id, wallet_id, entry_type, amount_minor, balance_after_minor,
               reference_type, reference_id, metadata, created_at
               FROM wallet_ledger WHERE wallet_id = $1
               ORDER BY created_at DESC LIMIT $2 OFFSET $3"#,
        )
        .bind(wallet_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn get_today_deposits(&self, user_id: Uuid) -> DomainResult<i64> {
        let row = sqlx::query(
            r#"SELECT COALESCE(SUM(l.amount_minor), 0)::bigint as total FROM wallet_ledger l
               JOIN wallets w ON l.wallet_id = w.id
               WHERE w.user_id = $1 AND l.entry_type IN ('deposit', 'manual_deposit')
               AND l.created_at >= CURRENT_DATE"#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        let total: i64 = row.try_get("total")?;
        Ok(total)
    }

    async fn get_today_withdrawals(&self, user_id: Uuid) -> DomainResult<i64> {
        let row = sqlx::query(
            r#"SELECT COALESCE(-SUM(l.amount_minor), 0)::bigint as total FROM wallet_ledger l
               JOIN wallets w ON l.wallet_id = w.id
               WHERE w.user_id = $1 AND l.entry_type IN ('withdrawal', 'withdrawal_reversal')
               AND l.created_at >= CURRENT_DATE"#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        let total: i64 = row.try_get("total")?;
        Ok(total)
    }

    fn pool(&self) -> sqlx::PgPool {
        self.pool.clone()
    }

    async fn freeze_wallet(&self, wallet_id: Uuid) -> DomainResult<Wallet> {
        let wallet: Wallet = sqlx::query_as(
            r#"UPDATE wallets SET is_frozen = TRUE, updated_at = now()
               WHERE id = $1
               RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
        )
        .bind(wallet_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| DomainError::WalletNotFound)?;
        Ok(wallet)
    }

    async fn unfreeze_wallet(&self, wallet_id: Uuid) -> DomainResult<Wallet> {
        let wallet: Wallet = sqlx::query_as(
            r#"UPDATE wallets SET is_frozen = FALSE, updated_at = now()
               WHERE id = $1
               RETURNING id, user_id, currency, balance_minor, is_frozen, created_at, updated_at"#,
        )
        .bind(wallet_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|_| DomainError::WalletNotFound)?;
        Ok(wallet)
    }
}

// ============================================================
// Game Repository
// ============================================================

pub struct PgGameRepository {
    pool: PgPool,
}

impl PgGameRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl GameRepository for PgGameRepository {
    async fn create_round(&self, round: &GameRound) -> DomainResult<GameRound> {
        let r: GameRound = sqlx::query_as(
            r#"INSERT INTO game_rounds (id, user_id, currency, total_stake_minor, bets,
               result_position, result_symbol, result_multiplier, gross_payout_minor,
               net_result_minor, is_win, server_seed_hash, server_seed, client_seed, nonce, created_at, paytable_version)
               VALUES ($1, $2, $3::currency_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
               RETURNING id, user_id, currency, total_stake_minor, bets, result_position,
               result_symbol, result_multiplier, gross_payout_minor, net_result_minor, is_win,
               server_seed_hash, server_seed, client_seed, nonce, created_at, paytable_version"#,
        )
        .bind(round.id)
        .bind(round.user_id)
        .bind(round.currency)
        .bind(round.total_stake_minor)
        .bind(round.bets.clone())
        .bind(round.result_position)
        .bind(&round.result_symbol)
        .bind(round.result_multiplier)
        .bind(round.gross_payout_minor)
        .bind(round.net_result_minor)
        .bind(round.is_win)
        .bind(&round.server_seed_hash)
        .bind(round.server_seed.clone())
        .bind(&round.client_seed)
        .bind(round.nonce)
        .bind(round.created_at)
        .bind(round.paytable_version)
        .fetch_one(&self.pool)
        .await?;
        Ok(r)
    }

    async fn find_round_by_id(&self, id: Uuid) -> DomainResult<Option<GameRound>> {
        let r: Option<GameRound> = sqlx::query_as(
            r#"SELECT id, user_id, currency, total_stake_minor, bets, result_position,
               result_symbol, result_multiplier, gross_payout_minor, net_result_minor,
               is_win, server_seed_hash, server_seed, client_seed, nonce, created_at, paytable_version
               FROM game_rounds WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(r)
    }

    async fn find_rounds_by_user(
        &self,
        user_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> DomainResult<Vec<GameRound>> {
        let rows: Vec<GameRound> = sqlx::query_as(
            r#"SELECT id, user_id, currency, total_stake_minor, bets, result_position,
               result_symbol, result_multiplier, gross_payout_minor, net_result_minor,
               is_win, server_seed_hash, server_seed, client_seed, nonce, created_at, paytable_version
               FROM game_rounds WHERE user_id = $1
               ORDER BY created_at DESC LIMIT $2 OFFSET $3"#,
        )
        .bind(user_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn reveal_server_seed(&self, round_id: Uuid, seed: &str) -> DomainResult<()> {
        sqlx::query(r#"UPDATE game_rounds SET server_seed = $1 WHERE id = $2"#)
            .bind(seed)
            .bind(round_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn find_oldest_unrevealed_round(&self, user_id: Uuid) -> DomainResult<Option<GameRound>> {
        let r: Option<GameRound> = sqlx::query_as(
            r#"SELECT id, user_id, currency, total_stake_minor, bets, result_position,
               result_symbol, result_multiplier, gross_payout_minor, net_result_minor,
               is_win, server_seed_hash, server_seed, client_seed, nonce, created_at, paytable_version
               FROM game_rounds
               WHERE user_id = $1 AND (server_seed IS NULL OR server_seed = '')
               ORDER BY created_at ASC LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(r)
    }

    async fn get_active_server_seed(&self, user_id: Uuid) -> DomainResult<(String, String, i64)> {
        use crate::domain::models::rng::{generate_server_seed, ProvablyFair};
        let rng = crate::domain::services::rng::ProvablyFairRng::new();

        let existing = sqlx::query(
            r#"SELECT seed_hash, seed, nonce_start, nonce_end
               FROM server_seeds WHERE user_id = $1 AND is_revealed = false
               ORDER BY nonce_start DESC LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(seed_row) = existing {
            let seed_hash: String = seed_row.get("seed_hash");
            let seed: String = seed_row.get("seed");
            let _nonce_start: i64 = seed_row.get("nonce_start");
            let nonce_end: i64 = seed_row.get("nonce_end");

            let max_nonce_row = sqlx::query(
                r#"SELECT COALESCE(MAX(nonce), 0) as max_nonce
                   FROM game_rounds WHERE user_id = $1"#,
            )
            .bind(user_id)
            .fetch_one(&self.pool)
            .await?;
            let max_nonce: i64 = max_nonce_row.try_get("max_nonce")?;

            let current_nonce = max_nonce + 1;

            if current_nonce <= nonce_end {
                return Ok((seed, seed_hash, current_nonce));
            }
        }

        let seed = generate_server_seed();
        let seed_hash = rng.hash_seed(&seed);

        let next_nonce_row = sqlx::query(
            r#"SELECT COALESCE(MAX(nonce), 0) + 1 as next_nonce
               FROM game_rounds WHERE user_id = $1"#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;
        let nonce_start: i64 = next_nonce_row.try_get::<i64, _>("next_nonce")?;
        let nonce_end = nonce_start + 999;

        sqlx::query(
            r#"INSERT INTO server_seeds (user_id, seed_hash, seed, nonce_start, nonce_end, is_revealed)
               VALUES ($1, $2, $3, $4, $5, false)"#,
        )
        .bind(user_id)
        .bind(&seed_hash)
        .bind(&seed)
        .bind(nonce_start)
        .bind(nonce_end)
        .execute(&self.pool)
        .await?;

        Ok((seed, seed_hash, nonce_start))
    }

    async fn find_seed_by_hash(&self, user_id: Uuid, seed_hash: &str) -> DomainResult<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT seed FROM server_seeds
               WHERE user_id = $1 AND seed_hash = $2 AND seed IS NOT NULL
               LIMIT 1"#,
        )
        .bind(user_id)
        .bind(seed_hash)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| r.0))
    }
}

// Note: Payment repository (PgPaymentRepository) and M-Pesa ops repository
// (PgMpesaOpsRepository) are now in payment_repository.rs

