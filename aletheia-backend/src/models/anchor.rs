use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct LedgerAnchor {
    pub id:               Uuid,
    pub manifest_id:      Option<Uuid>,
    pub asset_hash:       String,
    pub proof_hash:       String,
    pub network:          String,
    pub transaction_hash: Option<String>,
    pub block_number:     Option<i64>,
    pub status:           String,
    pub anchored_at:      Option<DateTime<Utc>>,
    pub created_at:       DateTime<Utc>,
}
