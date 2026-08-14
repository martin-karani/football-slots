use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct BonusGrant {
    pub id: Uuid,
    pub user_id: Uuid,
    pub source: String,
    pub amount_minor: i64,
    pub wager_multiplier: i32,
    pub wager_required_minor: i64,
    pub wagered_minor: i64,
    pub status: String,
    pub granted_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
}

impl BonusGrant {
    pub fn is_active(&self) -> bool {
        self.status == "active"
    }

    pub fn is_wagering_complete(&self) -> bool {
        self.wagered_minor >= self.wager_required_minor
    }

    pub fn is_expired(&self) -> bool {
        self.status == "active" && Utc::now() > self.expires_at
    }
}
