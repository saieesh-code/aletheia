use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::manifest::Manifest;
use crate::services::{audit, manifest as svc};
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct CreateRequest {
    pub asset_hash: String,
    pub device_id:  Option<String>,
    pub metadata:   Option<serde_json::Value>,
}

pub async fn create(
    State(state): State<SharedState>,
    Json(body):   Json<CreateRequest>,
) -> Result<Json<Manifest>, AppError> {
    if body.asset_hash.is_empty() {
        return Err(AppError::BadRequest("asset_hash is required".into()));
    }

    let m = svc::create(
        &state.db,
        body.asset_hash,
        body.device_id,
        body.metadata,
    )
    .await?;

    audit::log(
        &state.db,
        m.id,
        "manifest",
        "create",
        None,
        None,
    )
    .await?;

    Ok(Json(m))
}

pub async fn get(
    State(state): State<SharedState>,
    Path(id):     Path<Uuid>,
) -> Result<Json<Manifest>, AppError> {
    let m = svc::get(&state.db, id).await?;
    Ok(Json(m))
}
