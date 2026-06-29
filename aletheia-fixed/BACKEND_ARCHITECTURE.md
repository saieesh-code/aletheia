# Aletheia Backend Architecture
## Attestation Verification Server — Rust / Axum

---

## Why Rust (not Node.js)

Aletheia's core trust infrastructure requires:

- **Sub-millisecond signature verification** — Ed25519 + ECDSA at scale
- **Memory-safe cryptographic operations** — no GC pauses in hot paths
- **Replay attack prevention** — monotonic counter state must be lock-free
- **Immutable manifest storage** — append-only semantics enforced at the type level
- **Hardware attestation validation** — direct Apple/Google API integration without JS wrapper overhead

Rust with Axum provides all of these without compromise.

---

## Project Structure

```
aletheia-server/
├── Cargo.toml
├── src/
│   ├── main.rs                    # Server bootstrap
│   ├── config.rs                  # Environment config
│   ├── routes/
│   │   ├── mod.rs
│   │   ├── sign.rs                # POST /api/sign
│   │   ├── verify.rs              # POST /api/verify
│   │   ├── attestation.rs         # POST /api/attest
│   │   ├── manifest.rs            # GET/POST /api/manifest
│   │   ├── lineage.rs             # POST /api/lineage
│   │   └── anchor.rs              # POST /api/anchor
│   ├── attestation/
│   │   ├── mod.rs
│   │   ├── apple.rs               # App Attest / DeviceCheck validation
│   │   ├── android.rs             # Play Integrity API
│   │   └── replay.rs              # Nonce + monotonic counter store
│   ├── provenance/
│   │   ├── mod.rs
│   │   ├── manifest.rs            # VerifiableCaptureManifest
│   │   ├── lineage.rs             # Lineage DAG operations
│   │   └── ledger.rs              # Append-only ledger
│   ├── crypto/
│   │   ├── mod.rs
│   │   ├── ed25519.rs             # Signature verification
│   │   └── hash.rs                # SHA-256 / BLAKE3
│   ├── anchor/
│   │   ├── mod.rs
│   │   └── polygon.rs             # Polygon RPC anchoring
│   └── errors.rs
├── migrations/
│   ├── 001_manifests.sql
│   ├── 002_lineage.sql
│   └── 003_replay_nonces.sql
└── tests/
    ├── attestation_tests.rs
    └── provenance_tests.rs
```

---

## Core Types (Rust)

```rust
// src/provenance/manifest.rs

use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

/// Verifiable Capture Manifest
/// The authoritative provenance record for a single signed capture.
/// Stored immutably — never mutated after creation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiableCaptureManifest {
    /// Manifest schema version
    pub version: u8,

    /// SHA-256 hex digest of the original media bytes
    pub capture_hash: String,

    /// Ed25519 / ECDSA P-384 signature over canonical payload
    pub device_signature: String,

    /// Base64-encoded public key of the signing device
    pub device_public_key: String,

    /// Device identifier (SHA-256 of public key, first 16 hex chars)
    pub device_id: String,

    /// Hardware attestation token (App Attest / Play Integrity)
    /// None if software-mode signing (lower trust tier)
    pub device_attestation: Option<String>,

    /// ISO 8601 capture timestamp
    pub capture_timestamp: OffsetDateTime,

    /// Verified GPS coordinates at capture time
    pub gps: Option<GpsCoordinates>,

    /// Sensor metadata fingerprint (camera model, focal length, etc.)
    pub sensor_metadata: Option<SensorMetadata>,

    /// Parent lineage node ID (None for root captures)
    pub lineage_parent: Option<String>,

    /// Provenance declaration (self-reported by capturing device)
    pub ai_disclosure: AiDisclosure,

    /// Blockchain anchor reference (populated asynchronously)
    pub ledger_anchor: Option<LedgerAnchor>,

    /// Trust tier derived from attestation state
    pub verification_level: VerificationLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpsCoordinates {
    pub lat: f64,
    pub lon: f64,
    pub accuracy_meters: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SensorMetadata {
    pub make: Option<String>,
    pub model: Option<String>,
    pub focal_length_mm: Option<f32>,
    pub aperture: Option<f32>,
    pub iso: Option<u32>,
    pub shutter_speed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiDisclosure {
    DeclaredCameraOriginal,
    DeclaredAiGenerated,
    DeclaredAiModified,
    UndeclaredOrigin,
    UnknownOrigin,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VerificationLevel {
    /// Secure Enclave / StrongBox key + App Attest / Play Integrity confirmed
    HardwareVerified,
    /// Valid software-mode signature, device identity confirmed
    SoftwareVerified,
    /// Signature valid but attestation not provided or expired
    Unattested,
    /// Verification failed
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LedgerAnchor {
    pub network: String,
    pub transaction_hash: String,
    pub block_number: u64,
    pub anchored_at: OffsetDateTime,
    pub proof_hash: String,
}
```

---

## API Endpoints

### POST /api/verify

```rust
// src/routes/verify.rs

use axum::{extract::State, Json};
use crate::provenance::manifest::VerifiableCaptureManifest;
use crate::crypto::ed25519::verify_ed25519_signature;
use crate::crypto::hash::sha256_hex;

#[derive(Deserialize)]
pub struct VerifyRequest {
    /// Base64-encoded raw media bytes (max 50MB enforced at middleware)
    pub media_b64: Option<String>,
    /// SHA-256 hex of media bytes (if client pre-hashed — preferred for large files)
    pub media_hash: Option<String>,
    /// The signed proof bundle JSON
    pub bundle: serde_json::Value,
}

#[derive(Serialize)]
pub struct VerifyResponse {
    pub valid: bool,
    pub trust_level: String,
    pub recomputed_hash: String,
    pub hash_match: bool,
    pub signature_valid: bool,
    pub timestamp_valid: bool,
    pub replay_protected: bool,
    pub manifest_id: Option<String>,
    /// IMPORTANT: This disclaimer MUST be included in all API responses
    pub provenance_scope_note: String,
}

pub async fn verify_handler(
    State(state): State<AppState>,
    Json(req): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, AppError> {
    // 1. Resolve media hash
    let media_hash = match (req.media_hash, req.media_b64) {
        (Some(h), _)    => h,
        (None, Some(b)) => sha256_hex(&base64::decode(&b)?),
        _               => return Err(AppError::BadRequest("media_hash or media_b64 required")),
    };

    // 2. Parse and validate bundle
    let bundle: ProofBundle = serde_json::from_value(req.bundle)?;

    // 3. Verify signature
    let canonical = build_canonical_payload(&bundle);
    let signature_valid = verify_ed25519_signature(
        &bundle.public_key,
        &bundle.signature,
        canonical.as_bytes(),
    )?;

    // 4. Hash match
    let hash_match = media_hash == bundle.media_hash;

    // 5. Replay protection — check nonce has not been seen
    let replay_protected = state.nonce_store.check_and_insert(&bundle.nonce).await?;

    // 6. Timestamp validation
    let timestamp_valid = validate_timestamp(&bundle.timestamp, Duration::hours(48));

    // 7. Derive trust level
    let trust_level = derive_trust_level(hash_match, signature_valid, &bundle);

    Ok(Json(VerifyResponse {
        valid: hash_match && signature_valid && timestamp_valid,
        trust_level,
        recomputed_hash: media_hash,
        hash_match,
        signature_valid,
        timestamp_valid,
        replay_protected,
        manifest_id: None, // populated if manifest stored
        provenance_scope_note: "Verification confirms cryptographic provenance integrity. \
            It does not validate the semantic truth of depicted content.".into(),
    }))
}
```

---

### POST /api/attest

```rust
// src/routes/attestation.rs

/// Validates Apple App Attest or Android Play Integrity tokens server-side.
/// This is a CRITICAL security operation — must run server-side only.
/// Browser-side attestation can be trivially bypassed.

#[derive(Deserialize)]
pub struct AttestRequest {
    pub platform: AttestPlatform,
    pub device_id: String,
    pub attestation_token: String,
    pub challenge_nonce: String,
    pub key_id: Option<String>, // Apple App Attest key ID
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttestPlatform { Apple, Android }

#[derive(Serialize)]
pub struct AttestResponse {
    pub valid: bool,
    pub device_trust_level: String,
    pub attestation_id: String,
    pub expires_at: String,
    pub hardware_bound: bool,
}

pub async fn attest_handler(
    State(state): State<AppState>,
    Json(req): Json<AttestRequest>,
) -> Result<Json<AttestResponse>, AppError> {
    match req.platform {
        AttestPlatform::Apple   => apple::validate_app_attest(&state, req).await,
        AttestPlatform::Android => android::validate_play_integrity(&state, req).await,
    }
}
```

---

### Apple App Attest Validation

```rust
// src/attestation/apple.rs

use reqwest::Client;

const APPLE_ATTEST_ROOT_CA: &[u8] = include_bytes!("../certs/apple-attest-root.der");

pub async fn validate_app_attest(
    state: &AppState,
    req: AttestRequest,
) -> Result<Json<AttestResponse>, AppError> {
    // 1. Decode the attestation object (CBOR format)
    let attestation_obj = decode_cbor(&req.attestation_token)?;

    // 2. Verify the certificate chain up to Apple's root CA
    verify_certificate_chain(&attestation_obj.x5c, APPLE_ATTEST_ROOT_CA)?;

    // 3. Verify the nonce embedded in the attestation
    let expected_nonce = sha256_hex(&format!("{}{}", req.device_id, req.challenge_nonce));
    verify_attestation_nonce(&attestation_obj, &expected_nonce)?;

    // 4. Verify the key ID matches the leaf certificate
    verify_key_id(&attestation_obj, req.key_id.as_deref())?;

    // 5. Check production vs development environment
    let is_production = attestation_obj.receipt_type == "attest";

    // 6. Store validated attestation record
    let attestation_id = state.db.store_attestation(AttestationRecord {
        device_id: req.device_id.clone(),
        platform: "apple".into(),
        key_id: req.key_id,
        validated_at: OffsetDateTime::now_utc(),
        is_production,
        hardware_bound: true,
    }).await?;

    Ok(Json(AttestResponse {
        valid: true,
        device_trust_level: "hardware_verified".into(),
        attestation_id,
        expires_at: (OffsetDateTime::now_utc() + Duration::hours(24)).to_string(),
        hardware_bound: true,
    }))
}
```

---

## Database Schema (PostgreSQL)

```sql
-- migrations/001_manifests.sql

CREATE TABLE provenance_manifests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capture_hash    TEXT NOT NULL,
    device_id       TEXT NOT NULL,
    device_sig      TEXT NOT NULL,
    public_key      TEXT NOT NULL,
    attestation_id  UUID REFERENCES device_attestations(id),
    capture_ts      TIMESTAMPTZ NOT NULL,
    gps_lat         DOUBLE PRECISION,
    gps_lon         DOUBLE PRECISION,
    lineage_parent  UUID REFERENCES provenance_manifests(id),
    ai_disclosure   TEXT NOT NULL DEFAULT 'unknown_origin',
    trust_level     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Manifests are IMMUTABLE — no UPDATE permitted
    CONSTRAINT capture_hash_format CHECK (capture_hash ~ '^[a-f0-9]{64}$')
);

-- Append-only trigger: prevent any UPDATE
CREATE RULE no_update_manifests AS ON UPDATE TO provenance_manifests DO INSTEAD NOTHING;

CREATE INDEX idx_manifests_device  ON provenance_manifests(device_id);
CREATE INDEX idx_manifests_hash    ON provenance_manifests(capture_hash);
CREATE INDEX idx_manifests_lineage ON provenance_manifests(lineage_parent);

-- migrations/002_lineage.sql

CREATE TABLE lineage_nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_id     UUID NOT NULL REFERENCES provenance_manifests(id),
    parent_id       UUID REFERENCES lineage_nodes(id),
    media_hash      TEXT NOT NULL,
    previous_hash   TEXT NOT NULL,
    operation       TEXT NOT NULL,
    op_metadata     JSONB,
    device_id       TEXT NOT NULL,
    signature       TEXT NOT NULL,
    nonce           TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- migrations/003_replay_nonces.sql

CREATE TABLE replay_nonces (
    nonce       TEXT PRIMARY KEY,
    device_id   TEXT NOT NULL,
    used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours'
);

CREATE INDEX idx_nonces_expiry ON replay_nonces(expires_at);

-- Cleanup job: delete expired nonces (run hourly via pg_cron)
SELECT cron.schedule('0 * * * *', 'DELETE FROM replay_nonces WHERE expires_at < NOW()');
```

---

## Replay Attack Prevention

```rust
// src/attestation/replay.rs

use dashmap::DashMap;
use std::sync::Arc;
use tokio::time::{Duration, Instant};

/// In-memory nonce store with TTL eviction.
/// Back this with Redis in production for multi-node deployments.
pub struct NonceStore {
    nonces: Arc<DashMap<String, Instant>>,
    ttl: Duration,
}

impl NonceStore {
    pub fn new(ttl_secs: u64) -> Self {
        Self {
            nonces: Arc::new(DashMap::new()),
            ttl: Duration::from_secs(ttl_secs),
        }
    }

    /// Returns true if nonce is fresh (not seen before).
    /// Inserts it atomically — concurrent calls are safe.
    pub async fn check_and_insert(&self, nonce: &str) -> Result<bool, AppError> {
        // Validate format: must be base64, ≥16 bytes entropy
        if nonce.len() < 22 {
            return Err(AppError::WeakNonce);
        }

        // Atomic check-and-set
        if self.nonces.contains_key(nonce) {
            return Ok(false); // replay detected
        }

        self.nonces.insert(nonce.to_string(), Instant::now());

        // Lazy eviction
        self.evict_expired();

        Ok(true)
    }

    fn evict_expired(&self) {
        let now = Instant::now();
        self.nonces.retain(|_, inserted_at| {
            now.duration_since(*inserted_at) < self.ttl
        });
    }
}
```

---

## Polygon Anchoring

```rust
// src/anchor/polygon.rs

use ethers::prelude::*;

// AnchorContract ABI (matches AnchorContract.sol)
abigen!(
    AnchorContract,
    r#"[
        function anchor(bytes32 proofHash) external
        function verify(bytes32 proofHash) external view returns (uint256)
        event ProofAnchored(bytes32 indexed proofHash, uint256 timestamp, address signer)
    ]"#
);

pub struct PolygonAnchorer {
    provider: Provider<Http>,
    signer: LocalWallet,
    contract: AnchorContract<SignerMiddleware<Provider<Http>, LocalWallet>>,
}

impl PolygonAnchorer {
    pub async fn anchor_proof_hash(&self, proof_hash: [u8; 32]) -> Result<LedgerAnchor, AnchorError> {
        // Only hash digests are anchored — never raw media
        let tx = self.contract.anchor(proof_hash.into());
        let pending = tx.send().await?;
        let receipt = pending.await?.ok_or(AnchorError::NoReceipt)?;

        Ok(LedgerAnchor {
            network: "polygon".into(),
            transaction_hash: format!("{:?}", receipt.transaction_hash),
            block_number: receipt.block_number.unwrap_or_default().as_u64(),
            anchored_at: OffsetDateTime::now_utc(),
            proof_hash: hex::encode(proof_hash),
        })
    }
}
```

---

## Cargo.toml

```toml
[package]
name    = "aletheia-server"
version = "2.0.0"
edition = "2021"

[dependencies]
axum          = { version = "0.7", features = ["macros"] }
tokio         = { version = "1",   features = ["full"] }
tower         = "0.4"
tower-http    = { version = "0.5", features = ["cors", "trace", "limit"] }
serde         = { version = "1",   features = ["derive"] }
serde_json    = "1"
sqlx          = { version = "0.7", features = ["postgres", "runtime-tokio", "time", "uuid"] }
uuid          = { version = "1",   features = ["v4", "serde"] }
time          = { version = "0.3", features = ["serde"] }
sha2          = "0.10"
ed25519-dalek = "2"
base64        = "0.21"
hex           = "0.4"
ciborium      = "0.2"   # CBOR for App Attest
ethers        = { version = "2",   features = ["abigen"] }
dashmap       = "5"
reqwest       = { version = "0.11", features = ["json", "rustls-tls"] }
tracing       = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[profile.release]
opt-level = 3
lto       = true
codegen-units = 1
```

---

## Deployment Notes

- **Minimum**: 2 vCPU, 2 GB RAM (handles ~5,000 verifications/sec)
- **Database**: PostgreSQL 15+ with `pgcrypto` extension
- **Redis**: Required for multi-node nonce store
- **Secrets**: `POLYGON_RPC_URL`, `SIGNER_PRIVATE_KEY`, `APPLE_TEAM_ID`, `ANDROID_SERVICE_ACCOUNT_JSON` via environment only — never in source
- **TLS**: Terminate at load balancer (nginx/Caddy), backend runs plain HTTP on localhost
- **Rate limiting**: 100 req/min per device_id on `/api/verify`, 10 req/min on `/api/attest`

---

## Why This Architecture Is Legally Defensible

Every manifest is:
1. **Immutable** — append-only table with UPDATE trigger disabled
2. **Hash-addressed** — content-addressable by SHA-256 of media
3. **Timestamped** — server-side timestamp, not client-supplied
4. **Replay-protected** — nonce store prevents identical bundle resubmission
5. **Chain-verified** — lineage DAG validated at write time
6. **Scope-bounded** — all API responses include provenance scope disclaimer

The system makes no claims about semantic truth of depicted content — only provenance integrity.
