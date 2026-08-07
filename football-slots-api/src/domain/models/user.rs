use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Type;
use uuid::Uuid;

use super::errors::DomainError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "kyc_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum KycStatus {
    None,
    Pending,
    Verified,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub phone_number: String,
    pub display_name: Option<String>,
    pub kyc_status: KycStatus,
    pub date_of_birth: Option<NaiveDate>,
    pub self_excluded_until: Option<DateTime<Utc>>,
    pub daily_deposit_limit_minor: Option<i64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    /// Real-money wallet operations gate on this. Virtual play never does.
    pub fn can_play_real_money(&self, now: DateTime<Utc>) -> Result<(), DomainError> {
        if let Some(until) = self.self_excluded_until {
            if now < until {
                return Err(DomainError::SelfExcluded(until));
            }
        }
        if self.kyc_status != KycStatus::Verified {
            return Err(DomainError::KycRequired);
        }
        Ok(())
    }

    /// Check if user can deposit (not self-excluded)
    pub fn can_deposit(&self, now: DateTime<Utc>) -> Result<(), DomainError> {
        if let Some(until) = self.self_excluded_until {
            if now < until {
                return Err(DomainError::SelfExcluded(until));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub phone_number: String,
    pub display_name: Option<String>,
}
