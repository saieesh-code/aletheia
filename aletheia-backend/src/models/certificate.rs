use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct Certificate {
    pub id:          Uuid,
    pub manifest_id: Option<Uuid>,
    pub asset_hash:  String,
    pub trust_score: f64,
    pub trust_level: String,
    pub checks:      serde_json::Value,
    pub issued_at:   DateTime<Utc>,
    pub expires_at:  DateTime<Utc>,
    pub revoked:     bool,
    pub signature:   String,
}
