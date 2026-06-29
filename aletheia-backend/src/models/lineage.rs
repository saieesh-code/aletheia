use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct LineageNode {
    pub id:         Uuid,
    pub parent_id:  Option<Uuid>,
    pub asset_hash: String,
    pub device_id:  Option<String>,
    pub operation:  String,
    pub metadata:   Option<serde_json::Value>,
    pub signature:  Option<String>,
    pub depth:      i32,
    pub created_at: DateTime<Utc>,
}
