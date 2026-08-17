use async_trait::async_trait;
use uuid::Uuid;

use crate::adapters::persistence::postgres::PgPool;
use crate::domain::models::{
    errors::{DomainError, DomainResult},
    payment::{MpesaBalanceQuery, PaymentTransaction, ProviderInfo, UnmatchedDeposit},
};
use crate::ports::repositories::{MpesaOpsRepository, PaymentRepository, SettlementOutcome};

// ============================================================
// Payment Repository (provider-agnostic)
// ============================================================

pub struct PgPaymentRepository {
    pool: PgPool,
}

impl PgPaymentRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl PaymentRepository for PgPaymentRepository {
    async fn list_enabled_providers(&self) -> DomainResult<Vec<ProviderInfo>> {
        let rows: Vec<ProviderInfo> = sqlx::query_as(
            r#"SELECT code, display_name, enabled, supports_deposit, supports_withdrawal
               FROM payment_providers WHERE enabled = TRUE"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn find_by_idempotency_key(&self, user_id: Uuid, key: &str) -> DomainResult<Option<PaymentTransaction>> {
        let tx: Option<PaymentTransaction> = sqlx::query_as(
            r#"SELECT id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at
               FROM payment_transactions
               WHERE user_id = $1 AND client_idempotency_key = $2"#,
        )
        .bind(user_id)
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;
        Ok(tx)
    }

    async fn create_deposit_pending(&self, tx: &PaymentTransaction) -> DomainResult<PaymentTransaction> {
        let result: PaymentTransaction = sqlx::query_as(
            r#"INSERT INTO payment_transactions
               (id, user_id, provider, direction, status, currency, amount_minor,
                phone_number, client_idempotency_key, request_fingerprint)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               RETURNING id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at"#,
        )
        .bind(tx.id)
        .bind(tx.user_id)
        .bind(&tx.provider)
        .bind(&tx.direction)
        .bind(&tx.status)
        .bind(&tx.currency)
        .bind(tx.amount_minor)
        .bind(&tx.phone_number)
        .bind(tx.client_idempotency_key.as_deref())
        .bind(tx.request_fingerprint.as_deref())
        .fetch_one(&self.pool)
        .await?;
        Ok(result)
    }

    /// FIX #2: Single atomic transaction — INSERT(processing) + debit + ledger.
    async fn create_withdrawal_and_hold(&self, tx: &PaymentTransaction) -> DomainResult<PaymentTransaction> {
        let mut db_tx = self.pool.begin().await?;

        // 1. INSERT the payment row with status='processing'
        let payment: PaymentTransaction = match sqlx::query_as(
            r#"INSERT INTO payment_transactions
               (id, user_id, provider, direction, status, currency, amount_minor,
                phone_number, client_idempotency_key, request_fingerprint,
                provider_conversation_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               RETURNING id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at"#,
        )
        .bind(tx.id)
        .bind(tx.user_id)
        .bind(&tx.provider)
        .bind(&tx.direction)
        .bind(&tx.status)
        .bind(&tx.currency)
        .bind(tx.amount_minor)
        .bind(&tx.phone_number)
        .bind(tx.client_idempotency_key.as_deref())
        .bind(tx.request_fingerprint.as_deref())
        .bind(tx.provider_conversation_id.as_deref())
        .fetch_one(&mut *db_tx)
        .await
        {
            Ok(p) => p,
            Err(sqlx::Error::Database(db_err))
                if db_err.kind() == sqlx::error::ErrorKind::UniqueViolation =>
            {
                db_tx.rollback().await.ok();
                return Err(DomainError::PendingWithdrawalExists);
            }
            Err(e) => {
                db_tx.rollback().await.ok();
                return Err(DomainError::from(e));
            }
        };

        // 2. Guarded debit: must have sufficient balance and not be frozen
        let (balance_after,): (i64,) = sqlx::query_as(
            r#"UPDATE wallets
               SET balance_minor = balance_minor - $1, updated_at = now()
               WHERE user_id = $2 AND currency = 'real'::currency_type
                 AND balance_minor >= $1 AND NOT is_frozen
               RETURNING balance_minor"#,
        )
        .bind(tx.amount_minor)
        .bind(tx.user_id)
        .fetch_one(&mut *db_tx)
        .await
        .map_err(|_| DomainError::InsufficientBalance)?;

        // 3. Find wallet_id for ledger
        let (wallet_id,): (Uuid,) = sqlx::query_as(
            r#"SELECT id FROM wallets WHERE user_id = $1 AND currency = 'real'::currency_type"#,
        )
        .bind(tx.user_id)
        .fetch_one(&mut *db_tx)
        .await?;

        // 4. Write ledger entry
        sqlx::query(
            r#"INSERT INTO wallet_ledger
               (wallet_id, entry_type, amount_minor, balance_after_minor, reference_type, reference_id)
               VALUES ($1, 'withdrawal', $2, $3, 'payment_transaction', $4)"#,
        )
        .bind(wallet_id)
        .bind(-tx.amount_minor)
        .bind(balance_after)
        .bind(payment.id)
        .execute(&mut *db_tx)
        .await?;

        db_tx.commit().await?;
        Ok(payment)
    }

    async fn find_by_checkout_id(&self, provider: &str, checkout_id: &str) -> DomainResult<Option<PaymentTransaction>> {
        let tx: Option<PaymentTransaction> = sqlx::query_as(
            r#"SELECT id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at
               FROM payment_transactions
               WHERE provider = $1 AND provider_checkout_id = $2"#,
        )
        .bind(provider)
        .bind(checkout_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(tx)
    }

    async fn find_by_conversation_id(&self, provider: &str, conversation_id: &str) -> DomainResult<Option<PaymentTransaction>> {
        let tx: Option<PaymentTransaction> = sqlx::query_as(
            r#"SELECT id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at
               FROM payment_transactions
               WHERE provider = $1 AND provider_conversation_id = $2"#,
        )
        .bind(provider)
        .bind(conversation_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(tx)
    }

    async fn find_by_receipt(&self, provider: &str, receipt: &str) -> DomainResult<Option<PaymentTransaction>> {
        let tx: Option<PaymentTransaction> = sqlx::query_as(
            r#"SELECT id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at
               FROM payment_transactions
               WHERE provider = $1 AND provider_receipt = $2"#,
        )
        .bind(provider)
        .bind(receipt)
        .fetch_optional(&self.pool)
        .await?;
        Ok(tx)
    }

    async fn find_by_id(&self, id: Uuid) -> DomainResult<Option<PaymentTransaction>> {
        let tx: Option<PaymentTransaction> = sqlx::query_as(
            r#"SELECT id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at
               FROM payment_transactions WHERE id = $1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(tx)
    }

    async fn find_by_user(&self, user_id: Uuid, limit: i64) -> DomainResult<Vec<PaymentTransaction>> {
        let rows: Vec<PaymentTransaction> = sqlx::query_as(
            r#"SELECT id, user_id, provider, direction, status, currency, amount_minor,
               phone_number, client_idempotency_key, request_fingerprint,
               provider_checkout_id, provider_merchant_id, provider_receipt,
               provider_conversation_id, provider_reference,
               result_code, result_desc, raw_callback, created_at, updated_at
               FROM payment_transactions WHERE user_id = $1
               ORDER BY created_at DESC LIMIT $2"#,
        )
        .bind(user_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn set_provider_checkout_ids(&self, id: Uuid, checkout_id: Option<String>, merchant_id: Option<String>) -> DomainResult<()> {
        sqlx::query(
            r#"UPDATE payment_transactions
               SET provider_checkout_id = COALESCE($1, provider_checkout_id),
                   provider_merchant_id = COALESCE($2, provider_merchant_id),
                   updated_at = now()
               WHERE id = $3"#,
        )
        .bind(checkout_id)
        .bind(merchant_id)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── ATOMIC SETTLEMENT ────────────────────────────────────────

    /// FIX #4: pending → completed only.
    async fn complete_checkout_deposit(
        &self,
        payment_id: Uuid,
        receipt: Option<String>,
        result_code: Option<i32>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome> {
        let mut tx = self.pool.begin().await?;

        // Conditional UPDATE: pending → completed only
        let payment: Option<(Uuid, i64)> = sqlx::query_as(
            r#"UPDATE payment_transactions
               SET status = 'completed', provider_receipt = $2, result_code = $3,
                   raw_callback = $4, updated_at = now()
               WHERE id = $1 AND status = 'pending'
               RETURNING user_id, amount_minor"#,
        )
        .bind(payment_id)
        .bind(&receipt)
        .bind(result_code)
        .bind(&raw_callback)
        .fetch_optional(&mut *tx)
        .await?;

        let Some((user_id, amount_minor)) = payment else {
            tx.rollback().await.ok();
            return Ok(SettlementOutcome::AlreadySettled);
        };

        // FIX #10: deposits credit even frozen wallets. NO `NOT is_frozen` here.
        let (wallet_id, balance_after): (Uuid, i64) = sqlx::query_as(
            r#"INSERT INTO wallets (user_id, currency, balance_minor)
               VALUES ($1, 'real'::currency_type, $2)
               ON CONFLICT (user_id, currency) DO UPDATE
                 SET balance_minor = wallets.balance_minor + EXCLUDED.balance_minor,
                     updated_at = now()
               RETURNING id, balance_minor"#,
        )
        .bind(user_id)
        .bind(amount_minor)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query(
            r#"INSERT INTO wallet_ledger
               (wallet_id, entry_type, amount_minor, balance_after_minor, reference_type, reference_id)
               VALUES ($1, 'deposit', $2, $3, 'payment_transaction', $4)"#,
        )
        .bind(wallet_id)
        .bind(amount_minor)
        .bind(balance_after)
        .bind(payment_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(SettlementOutcome::Applied { payment_id, user_id, amount_minor })
    }

    /// Manual/unsolicited deposit: INSERT payment(completed) + credit wallet + ledger.
    async fn complete_manual_deposit(
        &self,
        user_id: Uuid,
        provider: &str,
        amount_minor: i64,
        currency: &str,
        receipt: &str,
        reference: Option<&str>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome> {
        let mut tx = self.pool.begin().await?;

        // INSERT payment row (completed). Unique (provider, provider_receipt) is the guard.
        let (payment_id,): (Uuid,) = match sqlx::query_as(
            r#"INSERT INTO payment_transactions
               (id, user_id, provider, direction, status, currency, amount_minor,
                phone_number, provider_receipt, provider_reference, raw_callback)
               VALUES ($1, $2, $3, 'deposit', 'completed', $4, $5, '', $6, $7, $8)
               RETURNING id"#,
        )
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(provider)
        .bind(currency)
        .bind(amount_minor)
        .bind(receipt)
        .bind(reference)
        .bind(&raw_callback)
        .fetch_one(&mut *tx)
        .await
        {
            Ok(pid) => pid,
            Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => {
                tx.rollback().await.ok();
                return Ok(SettlementOutcome::AlreadySettled);
            }
            Err(e) => {
                tx.rollback().await.ok();
                return Err(DomainError::from(e));
            }
        };

        // Credit wallet (works even on frozen wallets — FIX #10)
        let (wallet_id, balance_after): (Uuid, i64) = sqlx::query_as(
            r#"INSERT INTO wallets (user_id, currency, balance_minor)
               VALUES ($1, 'real'::currency_type, $2)
               ON CONFLICT (user_id, currency) DO UPDATE
                 SET balance_minor = wallets.balance_minor + EXCLUDED.balance_minor,
                     updated_at = now()
               RETURNING id, balance_minor"#,
        )
        .bind(user_id)
        .bind(amount_minor)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query(
            r#"INSERT INTO wallet_ledger
               (wallet_id, entry_type, amount_minor, balance_after_minor, reference_type, reference_id)
               VALUES ($1, 'manual_deposit', $2, $3, 'payment_transaction', $4)"#,
        )
        .bind(wallet_id)
        .bind(amount_minor)
        .bind(balance_after)
        .bind(payment_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(SettlementOutcome::Applied { payment_id, user_id, amount_minor })
    }

    /// Deposit failure: pending → failed, no money movement.
    async fn fail_deposit(
        &self,
        payment_id: Uuid,
        result_code: Option<i32>,
        result_desc: Option<String>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome> {
        let updated: u64 = sqlx::query(
            r#"UPDATE payment_transactions
               SET status = 'failed', result_code = $1, result_desc = $2,
                   raw_callback = $3, updated_at = now()
               WHERE id = $4 AND status = 'pending'"#,
        )
        .bind(result_code)
        .bind(result_desc)
        .bind(&raw_callback)
        .bind(payment_id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if updated == 0 {
            Ok(SettlementOutcome::AlreadySettled)
        } else {
            Ok(SettlementOutcome::Applied {
                payment_id,
                user_id: Uuid::nil(), // not needed for failure
                amount_minor: 0,
            })
        }
    }

    /// FIX #3: withdrawal callbacks transition ONLY processing → completed.
    async fn complete_withdrawal(
        &self,
        payment_id: Uuid,
        receipt: Option<String>,
        result_code: Option<i32>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome> {
        let updated: u64 = sqlx::query(
            r#"UPDATE payment_transactions
               SET status = 'completed', provider_receipt = $1, result_code = $2,
                   raw_callback = $3, updated_at = now()
               WHERE id = $4 AND status = 'processing'"#,
        )
        .bind(&receipt)
        .bind(result_code)
        .bind(&raw_callback)
        .bind(payment_id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if updated == 0 {
            tracing::warn!(
                "complete_withdrawal: tx={} not in 'processing' state — callback ignored",
                payment_id
            );
            Ok(SettlementOutcome::InvalidState)
        } else {
            Ok(SettlementOutcome::Applied {
                payment_id,
                user_id: Uuid::nil(),
                amount_minor: 0,
            })
        }
    }

    /// FIX #3: processing → reversed AND credit wallet back + ledger, atomically.
    async fn reverse_withdrawal(
        &self,
        payment_id: Uuid,
        result_code: Option<i32>,
        result_desc: Option<String>,
        raw_callback: Option<serde_json::Value>,
    ) -> DomainResult<SettlementOutcome> {
        let mut tx = self.pool.begin().await?;

        // Conditional UPDATE: processing → reversed only
        let payment: Option<(Uuid, i64)> = sqlx::query_as(
            r#"UPDATE payment_transactions
               SET status = 'reversed', result_code = $1, result_desc = $2,
                   raw_callback = $3, updated_at = now()
               WHERE id = $4 AND status = 'processing'
               RETURNING user_id, amount_minor"#,
        )
        .bind(result_code)
        .bind(result_desc)
        .bind(&raw_callback)
        .bind(payment_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some((user_id, amount_minor)) = payment else {
            tx.rollback().await.ok();
            tracing::warn!(
                "reverse_withdrawal: tx={} not in 'processing' state — reversal ignored",
                payment_id
            );
            return Ok(SettlementOutcome::InvalidState);
        };

        // Credit wallet back (works even on frozen wallets — FIX #10)
        let (wallet_id, balance_after): (Uuid, i64) = sqlx::query_as(
            r#"INSERT INTO wallets (user_id, currency, balance_minor)
               VALUES ($1, 'real'::currency_type, $2)
               ON CONFLICT (user_id, currency) DO UPDATE
                 SET balance_minor = wallets.balance_minor + EXCLUDED.balance_minor,
                     updated_at = now()
               RETURNING id, balance_minor"#,
        )
        .bind(user_id)
        .bind(amount_minor)
        .fetch_one(&mut *tx)
        .await?;

        sqlx::query(
            r#"INSERT INTO wallet_ledger
               (wallet_id, entry_type, amount_minor, balance_after_minor, reference_type, reference_id)
               VALUES ($1, 'withdrawal_reversal', $2, $3, 'payment_transaction', $4)"#,
        )
        .bind(wallet_id)
        .bind(amount_minor)
        .bind(balance_after)
        .bind(payment_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(SettlementOutcome::Applied { payment_id, user_id, amount_minor })
    }

    // ── Webhook event log ────────────────────────────────────────

    async fn record_webhook_event(&self, provider: &str, webhook: &str, payload: serde_json::Value) -> DomainResult<Uuid> {
        let (id,): (Uuid,) = sqlx::query_as(
            r#"INSERT INTO payment_webhook_events (provider, webhook, payload)
               VALUES ($1, $2, $3)
               RETURNING id"#,
        )
        .bind(provider)
        .bind(webhook)
        .bind(&payload)
        .fetch_one(&self.pool)
        .await?;
        Ok(id)
    }

    async fn update_webhook_event(
        &self,
        event_id: Uuid,
        payment_transaction_id: Option<Uuid>,
        external_event_id: Option<String>,
        event_type: Option<String>,
        processing_status: &str,
        processing_error: Option<String>,
    ) -> DomainResult<()> {
        sqlx::query(
            r#"UPDATE payment_webhook_events
               SET payment_transaction_id = $1, external_event_id = $2, event_type = $3,
                   processing_status = $4, processing_error = $5,
                   processed_at = CASE WHEN $4 = 'processed' THEN now() ELSE processed_at END
               WHERE id = $6"#,
        )
        .bind(payment_transaction_id)
        .bind(external_event_id)
        .bind(event_type)
        .bind(processing_status)
        .bind(processing_error)
        .bind(event_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // ── Quarantine ───────────────────────────────────────────────

    async fn record_unmatched_deposit(
        &self,
        provider: &str,
        receipt: &str,
        reference: Option<&str>,
        masked_msisdn: Option<&str>,
        currency: &str,
        amount_minor: i64,
        raw_callback: serde_json::Value,
    ) -> DomainResult<bool> {
        let result = sqlx::query(
            r#"INSERT INTO unmatched_deposits
               (provider, provider_receipt, provider_reference, masked_msisdn, currency, amount_minor, raw_callback)
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        )
        .bind(provider)
        .bind(receipt)
        .bind(reference)
        .bind(masked_msisdn)
        .bind(currency)
        .bind(amount_minor)
        .bind(&raw_callback)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => Ok(true),
            Err(sqlx::Error::Database(db_err)) if db_err.code().as_deref() == Some("23505") => Ok(false),
            Err(e) => Err(DomainError::from(e)),
        }
    }

    async fn list_unmatched_deposits(&self, limit: i64, offset: i64) -> DomainResult<Vec<UnmatchedDeposit>> {
        let rows: Vec<UnmatchedDeposit> = sqlx::query_as(
            r#"SELECT id, provider, provider_receipt, provider_reference, masked_msisdn,
               currency, amount_minor, raw_callback, status, resolved_user_id, resolved_at, created_at
               FROM unmatched_deposits WHERE status = 'unresolved'
               ORDER BY created_at DESC LIMIT $1 OFFSET $2"#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn resolve_unmatched_deposit(&self, deposit_id: Uuid, user_id: Uuid) -> DomainResult<UnmatchedDeposit> {
        let deposit: UnmatchedDeposit = sqlx::query_as(
            r#"UPDATE unmatched_deposits
               SET status = 'resolved', resolved_user_id = $1, resolved_at = now()
               WHERE id = $2
               RETURNING id, provider, provider_receipt, provider_reference, masked_msisdn,
               currency, amount_minor, raw_callback, status, resolved_user_id, resolved_at, created_at"#,
        )
        .bind(user_id)
        .bind(deposit_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(deposit)
    }

    fn pool(&self) -> sqlx::PgPool {
        self.pool.clone()
    }
}

// ============================================================
// M-Pesa Ops Repository (float monitoring)
// ============================================================

pub struct PgMpesaOpsRepository {
    pool: PgPool,
}

impl PgMpesaOpsRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl MpesaOpsRepository for PgMpesaOpsRepository {
    async fn create_balance_query(&self, originator_id: &str) -> DomainResult<MpesaBalanceQuery> {
        let q: MpesaBalanceQuery = sqlx::query_as(
            r#"INSERT INTO mpesa_balance_queries (originator_conversation_id)
               VALUES ($1)
               RETURNING id, originator_conversation_id, status, working_account_minor,
               utility_account_minor, merchant_account_minor, charges_paid_account_minor,
               raw_callback, created_at, updated_at"#,
        )
        .bind(originator_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(q)
    }

    async fn update_balance_result(
        &self,
        originator_id: &str,
        status: &str,
        working: Option<i64>,
        utility: Option<i64>,
        merchant: Option<i64>,
        charges: Option<i64>,
        raw: Option<serde_json::Value>,
    ) -> DomainResult<()> {
        sqlx::query(
            r#"UPDATE mpesa_balance_queries
               SET status = $1, working_account_minor = $2, utility_account_minor = $3,
                   merchant_account_minor = $4, charges_paid_account_minor = $5,
                   raw_callback = $6, updated_at = now()
               WHERE originator_conversation_id = $7"#,
        )
        .bind(status)
        .bind(working)
        .bind(utility)
        .bind(merchant)
        .bind(charges)
        .bind(&raw)
        .bind(originator_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get_latest_balance(&self) -> DomainResult<Option<MpesaBalanceQuery>> {
        let q: Option<MpesaBalanceQuery> = sqlx::query_as(
            r#"SELECT id, originator_conversation_id, status, working_account_minor,
               utility_account_minor, merchant_account_minor, charges_paid_account_minor,
               raw_callback, created_at, updated_at
               FROM mpesa_balance_queries
               ORDER BY created_at DESC LIMIT 1"#,
        )
        .fetch_optional(&self.pool)
        .await?;
        Ok(q)
    }
}
