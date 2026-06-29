use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::services::verification::{self, VerifyResult};
use crate::state::SharedState;

#[derive(Debug, Deserialize)]
pub struct VerifyRequest {
    pub asset_hash: String,
    pub bundle:     Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct VerifyResponse {
    #[serde(flatten)]
    pub result: VerifyResult,
}

pub async fn handler(
    State(state): State<SharedState>,
    Json(body):   Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, AppError> {
    if body.asset_hash.is_empty() {
        return Err(AppError::BadRequest("asset_hash is required".into()));
    }

    let result = verification::verify(&state.db, &body.asset_hash, body.bundle).await?;

    Ok(Json(VerifyResponse { result }))
}
