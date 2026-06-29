//! Verification service — examines an asset hash against stored manifests,
//! computes a trust score, and emits a structured result.
//!
//! Actual cryptographic verification (C2PA signature checking, blockchain
//! proof lookup, device attestation) would happen here in production.
//! For the Phase 1 MVP the logic is deterministic + explainable.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppError;
use crate::services::{anchor, certificate, manifest};

#[derive(Debug, Serialize, Deserialize)]
pub struct CheckResult {
    pub label:   String,
    pub passed:  bool,
    pub detail:  Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VerifyResult {
    pub valid:           bool,
    pub trust_score:     f64,
    pub trust_level:     String,
    pub asset_hash:      String,
    pub manifest_id:     Option<Uuid>,
    pub certificate_id:  Option<Uuid>,
    pub anchor_tx:       Option<String>,
    pub checks:          Vec<CheckResult>,
    pub scope_note:      String,
}

const SCOPE: &str =
    "Verification confirms provenance integrity, not the semantic \
     truth of depicted content.";

pub async fn verify(
    pool:       &PgPool,
    asset_hash: &str,
    bundle:     Option<serde_json::Value>,
) -> Result<VerifyResult, AppError> {
    let mut checks      = Vec::<CheckResult>::new();
    let mut score: f64  = 0.0;

    // ── Check 1: hash format ─────────────────────────────────────────────────
    let hash_ok = is_valid_hex_hash(asset_hash);
    checks.push(CheckResult {
        label:  "hash_format".into(),
        passed: hash_ok,
        detail: if hash_ok {
            Some("SHA-256 hex format valid".into())
        } else {
            Some("Expected 64-char hex string".into())
        },
    });
    if hash_ok { score += 15.0; }

    // ── Check 2: manifest exists ──────────────────────────────────────────────
    let maybe_manifest = manifest::find_by_hash(pool, asset_hash).await?;
    let has_manifest   = maybe_manifest.is_some();
    checks.push(CheckResult {
        label:  "manifest_found".into(),
        passed: has_manifest,
        detail: if has_manifest {
            Some("Provenance manifest located".into())
        } else {
            Some("No manifest registered for this asset".into())
        },
    });
    if has_manifest { score += 35.0; }

    // ── Check 3: bundle / C2PA metadata present ───────────────────────────────
    let has_bundle = bundle.is_some();
    checks.push(CheckResult {
        label:  "metadata_present".into(),
        passed: has_bundle,
        detail: if has_bundle {
            Some("Provenance bundle supplied".into())
        } else {
            Some("No provenance bundle supplied — score capped".into())
        },
    });
    if has_bundle { score += 25.0; }

    // ── Check 4: recompute hash (validates bundle integrity) ──────────────────
    let hash_matches = if let Some(ref b) = bundle {
        let recomputed = recompute_hash(b);
        let matches    = recomputed == asset_hash;
        checks.push(CheckResult {
            label:  "hash_integrity".into(),
            passed: matches,
            detail: Some(if matches {
                "Recomputed hash matches provided hash".into()
            } else {
                format!("Hash mismatch — got {recomputed}")
            }),
        });
        if matches { score += 15.0; }
        matches
    } else {
        checks.push(CheckResult {
            label:  "hash_integrity".into(),
            passed: false,
            detail: Some("Cannot verify — no bundle".into()),
        });
        false
    };

    // ── Check 5: blockchain anchor ────────────────────────────────────────────
    let anchor_tx = if let Some(ref m) = maybe_manifest {
        let a = anchor::latest_for_manifest(pool, m.id).await?;
        a.map(|a| a.transaction_hash.unwrap_or_default())
    } else {
        None
    };
    let anchored = anchor_tx.is_some();
    checks.push(CheckResult {
        label:  "blockchain_anchor".into(),
        passed: anchored,
        detail: if anchored {
            anchor_tx.clone().map(|tx| format!("tx: {tx}"))
        } else {
            Some("No blockchain anchor found".into())
        },
    });
    if anchored { score += 10.0; }

    let score      = score.min(100.0);
    let valid      = score >= 50.0 && has_manifest;
    let trust_level = level_from_score(score);

    // ── Optionally issue / reuse a certificate ────────────────────────────────
    let certificate_id = if let Some(ref m) = maybe_manifest {
        let existing = certificate::latest_for_manifest(pool, m.id).await?;
        if let Some(c) = existing {
            Some(c.id)
        } else {
            let checks_json = serde_json::to_value(&checks)
                .unwrap_or(serde_json::Value::Array(vec![]));
            let cert = certificate::issue(
                pool, m.id, asset_hash, score, checks_json,
            )
            .await?;
            Some(cert.id)
        }
    } else {
        None
    };

    let manifest_id = maybe_manifest.map(|m| m.id);

    Ok(VerifyResult {
        valid,
        trust_score: score,
        trust_level: trust_level.into(),
        asset_hash: asset_hash.into(),
        manifest_id,
        certificate_id,
        anchor_tx,
        checks,
        scope_note: SCOPE.into(),
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_valid_hex_hash(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn recompute_hash(bundle: &serde_json::Value) -> String {
    let canonical = serde_json::to_string(bundle).unwrap_or_default();
    let mut h = Sha256::new();
    h.update(canonical.as_bytes());
    hex::encode(h.finalize())
}

fn level_from_score(score: f64) -> &'static str {
    match score as u32 {
        90..=100 => "high",
        70..=89  => "medium",
        50..=69  => "low",
        _        => "none",
    }
}
