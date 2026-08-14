use async_trait::async_trait;
use sqlx::Row;
use uuid::Uuid;

use crate::adapters::persistence::postgres::PgPool;
use crate::domain::models::bonus::BonusGrant;
use crate::domain::models::errors::DomainResult;
use crate::ports::repositories::BonusRepository;

pub struct PgBonusRepository {
    pool: PgPool,
}

impl PgBonusRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl BonusRepository for PgBonusRepository {
    async fn find_active_grant(&self, user_id: Uuid) -> DomainResult<Option<BonusGrant>> {
        let grant: Option<BonusGrant> = sqlx::query_as(
            r#"SELECT id, user_id, source, amount_minor, wager_multiplier,
                      wager_required_minor, wagered_minor, status,
                      granted_at, expires_at, resolved_at
               FROM bonus_grants
               WHERE user_id = $1 AND status = 'active'
               ORDER BY granted_at DESC LIMIT 1"#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(grant)
    }

    async fn create_grant(
        &self,
        user_id: Uuid,
        amount_minor: i64,
        wager_multiplier: i32,
        expiry_hours: i64,
    ) -> DomainResult<BonusGrant> {
        let wager_required = amount_minor * wager_multiplier as i64;
        let grant: BonusGrant = sqlx::query_as(
            r#"INSERT INTO bonus_grants
                   (user_id, source, amount_minor, wager_multiplier,
                    wager_required_minor, status, granted_at, expires_at)
               VALUES ($1, 'spin_meter', $2, $3, $4, 'active', now(),
                       now() + make_interval(hours => $5))
               RETURNING id, user_id, source, amount_minor, wager_multiplier,
                         wager_required_minor, wagered_minor, status,
                         granted_at, expires_at, resolved_at"#,
        )
        .bind(user_id)
        .bind(amount_minor)
        .bind(wager_multiplier)
        .bind(wager_required)
        .bind(expiry_hours)
        .fetch_one(&self.pool)
        .await?;
        Ok(grant)
    }

    async fn increment_wagered(&self, grant_id: Uuid, stake_minor: i64) -> DomainResult<BonusGrant> {
        let grant: BonusGrant = sqlx::query_as(
            r#"UPDATE bonus_grants
               SET wagered_minor = wagered_minor + $1
               WHERE id = $2 AND status = 'active'
               RETURNING id, user_id, source, amount_minor, wager_multiplier,
                         wager_required_minor, wagered_minor, status,
                         granted_at, expires_at, resolved_at"#,
        )
        .bind(stake_minor)
        .bind(grant_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(grant)
    }

    async fn mark_completed(&self, grant_id: Uuid) -> DomainResult<()> {
        sqlx::query(
            r#"UPDATE bonus_grants SET status = 'completed', resolved_at = now()
               WHERE id = $1 AND status = 'active'"#,
        )
        .bind(grant_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn mark_lost(&self, grant_id: Uuid) -> DomainResult<()> {
        sqlx::query(
            r#"UPDATE bonus_grants SET status = 'lost', resolved_at = now()
               WHERE id = $1 AND status = 'active'"#,
        )
        .bind(grant_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn mark_expired(&self, grant_id: Uuid) -> DomainResult<()> {
        sqlx::query(
            r#"UPDATE bonus_grants SET status = 'expired', resolved_at = now()
               WHERE id = $1 AND status = 'active'"#,
        )
        .bind(grant_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn count_today_grants(&self, user_id: Uuid) -> DomainResult<i64> {
        let row = sqlx::query(
            r#"SELECT COUNT(*) as count FROM bonus_grants
               WHERE user_id = $1 AND granted_at >= CURRENT_DATE"#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;
        let count: i64 = row.try_get("count")?;
        Ok(count)
    }
}
