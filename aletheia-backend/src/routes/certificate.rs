use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::certificate::Certificate;
use crate::services::certificate as svc;
use crate::state::SharedState;

/// Manually issue a certificate for a known manifest.
#[derive(Debug, Deserialize)]
pub struct IssueRequest {
    pub manifest_id: Uuid,
    pub asset_hash:  String,
    pub trust_score: Option<f64>,
}

pub async fn issue(
    State(state): State<SharedState>,
    Json(body):   Json<IssueRequest>,
) -> Result<Json<Certificate>, AppError> {
    let score  = body.trust_score.unwrap_or(75.0).clamp(0.0, 100.0);
    let checks = serde_json::json!([]);

    let cert = svc::issue(
        &state.db,
        body.manifest_id,
        &body.asset_hash,
        score,
        checks,
    )
    .await?;

    Ok(Json(cert))
}

pub async fn get(
    State(state): State<SharedState>,
    Path(id):     Path<Uuid>,
) -> Result<Json<Certificate>, AppError> {
    let cert = svc::get(&state.db, id).await?;
    Ok(Json(cert))
}
