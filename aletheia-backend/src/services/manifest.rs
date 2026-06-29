use base64::{engine::general_purpose::STANDARD as B64, Engine};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::manifest::Manifest;

pub async fn create(
    pool:      &PgPool,
    asset_hash: String,
    device_id:  Option<String>,
    metadata:   Option<serde_json::Value>,
) -> Result<Manifest, AppError> {
    let id        = Uuid::new_v4();
    let signature = sign(&id, &asset_hash);

    let m = sqlx::query_as::<_, Manifest>(
        r#"
        INSERT INTO provenance_manifests
            (id, asset_hash, device_id, metadata, signature)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(&asset_hash)
    .bind(&device_id)
    .bind(&metadata)
    .bind(&signature)
    .fetch_one(pool)
    .await?;

    Ok(m)
}

pub async fn get(pool: &PgPool, id: Uuid) -> Result<Manifest, AppError> {
    sqlx::query_as::<_, Manifest>(
        "SELECT * FROM provenance_manifests WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn find_by_hash(
    pool: &PgPool,
    hash: &str,
) -> Result<Option<Manifest>, AppError> {
    let m = sqlx::query_as::<_, Manifest>(
        r#"
        SELECT * FROM provenance_manifests
        WHERE asset_hash = $1
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(hash)
    .fetch_optional(pool)
    .await?;

    Ok(m)
}

/// SHA-256 of (id || ":" || asset_hash) encoded as base64.
/// A real deployment would use the Ed25519 server signing key here.
fn sign(id: &Uuid, asset_hash: &str) -> String {
    let mut h = Sha256::new();
    h.update(id.as_bytes());
    h.update(b":");
    h.update(asset_hash.as_bytes());
    B64.encode(h.finalize())
}
