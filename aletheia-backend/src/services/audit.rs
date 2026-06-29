use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::audit::AuditEvent;

pub async fn log(
    pool:        &PgPool,
    entity_id:   Uuid,
    entity_type: &str,
    action:      &str,
    actor:       Option<&str>,
    metadata:    Option<serde_json::Value>,
) -> Result<AuditEvent, AppError> {
    let id = Uuid::new_v4();

    let ev = sqlx::query_as::<_, AuditEvent>(
        r#"
        INSERT INTO audit_events (id, entity_id, entity_type, action, actor, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(entity_id)
    .bind(entity_type)
    .bind(action)
    .bind(actor)
    .bind(metadata)
    .fetch_one(pool)
    .await?;

    Ok(ev)
}

pub async fn list_for_entity(
    pool:      &PgPool,
    entity_id: Uuid,
) -> Result<Vec<AuditEvent>, AppError> {
    let events = sqlx::query_as::<_, AuditEvent>(
        "SELECT * FROM audit_events WHERE entity_id = $1 ORDER BY created_at ASC",
    )
    .bind(entity_id)
    .fetch_all(pool)
    .await?;

    Ok(events)
}
