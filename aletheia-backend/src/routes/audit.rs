use axum::{
    extract::{Path, State},
    Json,
};
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::audit::AuditEvent;
use crate::services::audit as svc;
use crate::state::SharedState;

#[derive(Debug, Serialize)]
pub struct AuditResponse {
    pub entity_id: Uuid,
    pub count:     usize,
    pub events:    Vec<AuditEvent>,
}

pub async fn get_trail(
    State(state): State<SharedState>,
    Path(id):     Path<Uuid>,
) -> Result<Json<AuditResponse>, AppError> {
    let events = svc::list_for_entity(&state.db, id).await?;

    if events.is_empty() {
        return Err(AppError::NotFound);
    }

    let count = events.len();
    Ok(Json(AuditResponse { entity_id: id, count, events }))
}
