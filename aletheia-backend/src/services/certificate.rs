use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::certificate::Certificate;

pub async fn issue(
    pool:        &PgPool,
    manifest_id: Uuid,
    asset_hash:  &str,
    trust_score: f64,
    checks:      serde_json::Value,
) -> Result<Certificate, AppError> {
    let id         = Uuid::new_v4();
    let now        = Utc::now();
    let expires_at = now + chrono::Duration::days(365);
    let level      = level_from_score(trust_score);
    let sig        = fingerprint(&id, manifest_id, asset_hash);

    let cert = sqlx::query_as::<_, Certificate>(
        r#"
        INSERT INTO verification_certificates
            (id, manifest_id, asset_hash, trust_score, trust_level,
             checks, issued_at, expires_at, signature)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(manifest_id)
    .bind(asset_hash)
    .bind(trust_score)
    .bind(level)
    .bind(checks)
    .bind(now)
    .bind(expires_at)
    .bind(&sig)
    .fetch_one(pool)
    .await?;

    Ok(cert)
}

pub async fn get(pool: &PgPool, id: Uuid) -> Result<Certificate, AppError> {
    sqlx::query_as::<_, Certificate>(
        "SELECT * FROM verification_certificates WHERE id = $1 AND revoked = false",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn latest_for_manifest(
    pool:        &PgPool,
    manifest_id: Uuid,
) -> Result<Option<Certificate>, AppError> {
    let c = sqlx::query_as::<_, Certificate>(
        r#"
        SELECT * FROM verification_certificates
        WHERE manifest_id = $1 AND revoked = false
        ORDER BY issued_at DESC
        LIMIT 1
        "#,
    )
    .bind(manifest_id)
    .fetch_optional(pool)
    .await?;

    Ok(c)
}

fn level_from_score(score: f64) -> &'static str {
    match score as u32 {
        90..=100 => "high",
        70..=89  => "medium",
        50..=69  => "low",
        _        => "none",
    }
}

fn fingerprint(cert_id: &Uuid, manifest_id: Uuid, asset_hash: &str) -> String {
    let mut h = Sha256::new();
    h.update(cert_id.as_bytes());
    h.update(b":");
    h.update(manifest_id.as_bytes());
    h.update(b":");
    h.update(asset_hash.as_bytes());
    hex::encode(h.finalize())
}
