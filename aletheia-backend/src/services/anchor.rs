use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::anchor::LedgerAnchor;

pub async fn anchor(
    pool:        &PgPool,
    manifest_id: Uuid,
    asset_hash:  &str,
    network:     Option<String>,
) -> Result<LedgerAnchor, AppError> {
    let id         = Uuid::new_v4();
    let net        = network.unwrap_or_else(|| "mock".to_string());
    let proof_hash = compute_proof_hash(&id, manifest_id, asset_hash);

    // Mock: generate a fake tx hash immediately.
    // Replace this block with real RPC calls when blockchain config is present.
    let tx_hash    = format!("0x{}", hex::encode(Sha256::digest(proof_hash.as_bytes())));
    let block_num: i64 = 1_000_000 + (Utc::now().timestamp() % 1_000_000);
    let now        = Utc::now();

    let anchor = sqlx::query_as::<_, LedgerAnchor>(
        r#"
        INSERT INTO ledger_anchors
            (id, manifest_id, asset_hash, proof_hash, network,
             transaction_hash, block_number, status, anchored_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8)
        RETURNING *
        "#,
    )
    .bind(id)
    .bind(manifest_id)
    .bind(asset_hash)
    .bind(&proof_hash)
    .bind(&net)
    .bind(&tx_hash)
    .bind(block_num)
    .bind(now)
    .fetch_one(pool)
    .await?;

    Ok(anchor)
}

pub async fn get(pool: &PgPool, id: Uuid) -> Result<LedgerAnchor, AppError> {
    sqlx::query_as::<_, LedgerAnchor>(
        "SELECT * FROM ledger_anchors WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

pub async fn latest_for_manifest(
    pool:        &PgPool,
    manifest_id: Uuid,
) -> Result<Option<LedgerAnchor>, AppError> {
    let a = sqlx::query_as::<_, LedgerAnchor>(
        r#"
        SELECT * FROM ledger_anchors
        WHERE manifest_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(manifest_id)
    .fetch_optional(pool)
    .await?;
    Ok(a)
}

fn compute_proof_hash(anchor_id: &Uuid, manifest_id: Uuid, asset_hash: &str) -> String {
    let mut h = Sha256::new();
    h.update(anchor_id.as_bytes());
    h.update(b":");
    h.update(manifest_id.as_bytes());
    h.update(b":");
    h.update(asset_hash.as_bytes());
    hex::encode(h.finalize())
}
