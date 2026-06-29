use axum::{
    extract::{Path, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::lineage::LineageNode;
use crate::services::{audit, lineage as svc};
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct CreateNodeRequest {
    pub asset_hash: String,
    pub parent_id:  Option<Uuid>,
    pub device_id:  Option<String>,
    pub operation:  Option<String>,
    pub metadata:   Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ChainResponse {
    pub nodes:    Vec<LineageNode>,
    pub depth:    usize,
    pub root_id:  Option<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct VerifyChainResponse {
    pub id:    Uuid,
    pub valid: bool,
    pub depth: usize,
}

pub async fn create_node(
    State(state): State<SharedState>,
    Json(body):   Json<CreateNodeRequest>,
) -> Result<Json<LineageNode>, AppError> {
    if body.asset_hash.is_empty() {
        return Err(AppError::BadRequest("asset_hash is required".into()));
    }

    let node = svc::create_node(
        &state.db,
        body.asset_hash,
        body.parent_id,
        body.device_id,
        body.operation,
        body.metadata,
    )
    .await?;

    audit::log(
        &state.db,
        node.id,
        "lineage_node",
        "create",
        None,
        None,
    )
    .await?;

    Ok(Json(node))
}

pub async fn get_chain(
    State(state): State<SharedState>,
    Path(id):     Path<Uuid>,
) -> Result<Json<ChainResponse>, AppError> {
    let nodes   = svc::get_chain(&state.db, id).await?;
    let depth   = nodes.len();
    let root_id = nodes.first().map(|n| n.id);

    Ok(Json(ChainResponse { nodes, depth, root_id }))
}

pub async fn verify_chain(
    State(state): State<SharedState>,
    Path(id):     Path<Uuid>,
) -> Result<Json<VerifyChainResponse>, AppError> {
    let chain = svc::get_chain(&state.db, id).await?;
    let valid  = svc::verify_chain(&state.db, id).await?;

    Ok(Json(VerifyChainResponse {
        id,
        valid,
        depth: chain.len(),
    }))
}
