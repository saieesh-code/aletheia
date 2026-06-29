use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id:          Uuid,
    pub entity_id:   Uuid,
    pub entity_type: String,
    pub action:      String,
    pub actor:       Option<String>,
    pub metadata:    Option<serde_json::Value>,
    pub created_at:  DateTime<Utc>,
}
