use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::anchor::LedgerAnchor;
use crate::services::{anchor as svc, audit};
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct AnchorRequest {
    pub manifest_id: Uuid,
    pub asset_hash:  String,
    /// Optional: "polygon", "ethereum", "base", "mock" (default: "mock")
    pub network:     Option<String>,
}

pub async fn anchor(
    State(state): State<SharedState>,
    Json(body):   Json<AnchorRequest>,
) -> Result<Json<LedgerAnchor>, AppError> {
    if body.asset_hash.is_empty() {
        return Err(AppError::BadRequest("asset_hash is required".into()));
    }

    let a = svc::anchor(
        &state.db,
        body.manifest_id,
        &body.asset_hash,
        body.network.clone(),
    )
    .await?;

    audit::log(
        &state.db,
        a.id,
        "anchor",
        "create",
        None,
        Some(serde_json::json!({
            "network":     body.network.as_deref().unwrap_or("mock"),
            "manifest_id": body.manifest_id,
        })),
    )
    .await?;

    Ok(Json(a))
}

pub async fn get(
    State(state): State<SharedState>,
    Path(id):     Path<Uuid>,
) -> Result<Json<LedgerAnchor>, AppError> {
    let a = svc::get(&state.db, id).await?;
    Ok(Json(a))
}
