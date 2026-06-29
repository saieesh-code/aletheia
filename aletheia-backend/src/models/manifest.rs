use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct Manifest {
    pub id:                 Uuid,
    pub asset_hash:         String,
    pub device_id:          Option<String>,
    pub metadata:           Option<serde_json::Value>,
    pub signature:          Option<String>,
    pub verification_level: String,
    pub immutable:          bool,
    pub created_at:         DateTime<Utc>,
    pub updated_at:         DateTime<Utc>,
}
