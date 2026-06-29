# Aletheia — Reality Trust Infrastructure

<p align="center">
  <img src="./docs/banner.png" alt="Aletheia Banner" width="100%">
</p>

<p align="center">
  <b>Cryptographic provenance verification, immutable lineage tracking, attestation services, and probabilistic forensic media analysis.</b>
</p>

<p align="center">
  <a href="https://aletheia-rhqw.onrender.com"><strong>Live Demo</strong></a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#deployment">Deploy</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React 19">
  <img src="https://img.shields.io/badge/Rust-1.78-000000?logo=rust" alt="Rust 1.78">
  <img src="https://img.shields.io/badge/Axum-web%20framework-8B0000?logo=rust" alt="Axum">
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-multi--stage-2496ED?logo=docker" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License">
</p>

---

## What is Aletheia?

Aletheia is a **cryptographic provenance layer for the real world**. In an era of AI-generated content and deepfakes, Aletheia provides cryptographic proof that media was captured by a real device at a real time and place — and that it hasn't been tampered with since.

### Core Philosophy: Trust Nothing, Verify Everything

- **Bound to device** — Each device generates an Ed25519 keypair. The secret never leaves the client; the public key becomes the device identity.
- **Signed at the source** — On capture, Aletheia hashes the raw bytes (SHA-256) and signs a canonical bundle containing hash, timestamp, GPS, nonce, and device ID.
- **Verifiable anywhere** — Any third party re-hashes the media and verifies the signature offline. One byte changed → verification fails.
- **Hash-chained ledger** — Every signed capture is appended to a tamper-evident log. Each entry pins the previous hash — no blockchain required.
- **Zero trust UX** — Verification surfaces every check that passed or failed, plus a transparent trust score from 0 to 100.

---

## How It Works

| Step | Action | Detail |
|------|--------|--------|
| **1** | **Capture media** | User captures a photo, video, or selects a file |
| **2** | **Hash + sign on device** | SHA-256 hash computed; Ed25519 signature created over canonical bundle |
| **3** | **Append to ledger** | Signed bundle added to append-only, hash-chained ledger |
| **4** | **Verify anywhere** | Anyone can verify offline — re-hash media, check signature, validate chain |

### Signature Bundle Structure

```json
{
  "version": 2,
  "media_hash": "sha256:abc123...",
  "timestamp": "2025-01-15T10:30:00Z",
  "device_id": "dev_1234567890abcdef",
  "signature": "base64Ed25519Sig...",
  "public_key": "base64Ed25519PubKey...",
  "nonce": "base64Nonce...",
  "gps": { "lat": 40.7128, "lng": -74.0060 },
  "ai_disclosure": "camera_original"
}
```

---

## Architecture

```
+----------------------------------+        +----------------------------------+
|         FRONTEND (React)         |        |         BACKEND (Rust)           |
|  aletheia-fixed/                 |        |  aletheia-backend/               |
|  + React 19 + TypeScript         |<------>|  + Axum web framework            |
|  + Vite build tool               |  API   |  + SQLx (PostgreSQL)             |
|  + Tailwind CSS v4               |        |  + Ed25519 / SHA-256 crypto      |
|  + shadcn/ui + Radix UI          |        |  + Hardware attestation          |
|  + TanStack Router + Query       |        |  + Replay attack prevention      |
|  + tweetnacl (browser crypto)    |        |  + Polygon blockchain anchor     |
+----------------------------------+        +----------------------------------+
           |                                                |
           |  SDKs                                          |  PostgreSQL
           v                                                v
+--------------------+                    +----------------------------------+
| aletheia-ios-sdk   |                    |         DATABASE                 |
| (Swift)            |                    |  + Provenance manifests          |
| - Secure Enclave   |                    |  + Lineage DAG                   |
| - App Attest       |                    |  + Replay nonce store            |
| - CryptoKit        |                    +----------------------------------+
+--------------------+                                 ^
| aletheia-android-sdk|                                |
| (Kotlin)            |                    +----------------------------------+
| - StrongBox         |                    |         BLOCKCHAIN (Optional)    |
| - Play Integrity    |                    |  + Polygon anchoring             |
| - Biometric Auth    |                    |  + Immutable proof storage       |
+--------------------+                    +----------------------------------+
```

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 19** + TypeScript | UI framework |
| **Vite** | Build tool & dev server |
| **Tailwind CSS v4** | Utility-first styling |
| **shadcn/ui** + **Radix UI** | Accessible UI components |
| **TanStack Router** | Type-safe client-side routing |
| **TanStack Query** | Server state management |
| **tweetnacl** | Ed25519 cryptography in browser |
| **Web Crypto API** | SHA-256 hashing via `crypto.subtle` |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Rust 1.78** | Systems programming language |
| **Axum** | Tokio-based web framework |
| **SQLx** | Compile-time checked SQL queries |
| **PostgreSQL** | Relational database |
| **Ed25519-dalek** | High-performance signature verification |
| **BLAKE3** | Cryptographic hashing (optional) |

### Mobile SDKs
| SDK | Platform | Hardware Security |
|-----|----------|-------------------|
| **aletheia-ios-sdk** | iOS | Secure Enclave, App Attest, CryptoKit |
| **aletheia-android-sdk** | Android | StrongBox, Play Integrity, Biometric Auth |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| **Docker** | Multi-stage containerized deployment |
| **Render** | Cloud hosting platform |
| **Polygon** | Optional blockchain anchoring |

---

## Project Structure

```
aletheia/
├── aletheia-fixed/              # React frontend application
│   ├── src/
│   │   ├── pages/               # Route pages (Capture, Verify, Ledger, etc.)
│   │   ├── components/          # Reusable UI components
│   │   ├── hooks/               # Custom React hooks
│   │   ├── lib/                 # Utility functions
│   │   └── App.tsx              # Root component with routing
│   ├── package.json             # Frontend dependencies
│   ├── vite.config.ts           # Vite configuration
│   └── BACKEND_ARCHITECTURE.md  # Detailed backend documentation
│
├── aletheia-backend/            # Rust backend API
│   ├── src/
│   │   ├── main.rs              # Server bootstrap
│   │   ├── config.rs            # Environment configuration
│   │   ├── state.rs             # Application state
│   │   ├── error.rs             # Error handling
│   │   ├── models/              # Data models
│   │   ├── routes/              # API route handlers
│   │   │   ├── verify.rs        # POST /api/verify
│   │   │   ├── sign.rs          # POST /api/sign
│   │   │   ├── attestation.rs   # POST /api/attest
│   │   │   ├── lineage.rs       # POST /api/lineage
│   │   │   └── anchor.rs        # POST /api/anchor
│   │   └── services/            # Business logic
│   ├── migrations/              # Database migrations
│   ├── Cargo.toml               # Rust dependencies
│   └── Dockerfile               # Backend container
│
├── aletheia-ios-sdk/            # iOS Swift SDK
├── aletheia-android-sdk/        # Android Kotlin SDK
├── Dockerfile                   # Multi-stage unified build
├── render.yaml                  # Render.com deployment config
└── README.md                    # This file
```

---

## Features

### Capture & Sign
- **Live camera capture** with real-time GPS tagging
- **File upload** support (images, video, PDF)
- **AI disclosure declaration** (camera original / AI generated / AI modified / undeclared)
- **Ed25519 signing** bound to device identity
- **Hardware security** ready (Secure Enclave, StrongBox, TPM 2.0)

### Verify Provenance
- **Offline verification** — no server trust required
- **Trust score** from 0 to 100 with detailed breakdown
- **Cryptographic checks** — SHA-256 hash match, Ed25519 signature validity, timestamp validation, replay protection
- **Downloadable certificates** with unique certificate IDs
- **Provenance scope note** — "Verification confirms provenance integrity, not independent semantic truth of depicted content"

### Provenance Ledger
- **Append-only** hash-chained structure
- **Merkle root** computation
- **Chain integrity verification** — detect any tampering
- **Zero entries** on fresh start

### Lineage Tracking
- **Git-like commit history** for media
- **Full provenance timeline** — when signed, by which device, where
- **Lineage DAG** operations for branched histories
- **Demo lineage** for testing

### Hardware Trust
- **5 hardware security modules** supported:
  1. Apple Secure Enclave (T2/M-series)
  2. Apple App Attest
  3. TPM 2.0 (Desktop)
  4. Android StrongBox
  5. Biometric Auth Gate
- **Security posture scoring** — hardware + software composite score
- **Device attestation** (App Attest / Play Integrity)

### Forensic Analysis
- **Probabilistic media analysis**
- **Trust signal scoring** with visual indicators
- **Comprehensive check breakdown**

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.78+
- [PostgreSQL](https://www.postgresql.org/) 15+
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

### 1. Clone the repository

```bash
git clone https://github.com/saieesh-code/aletheia.git
cd aletheia
```

### 2. Set up the Backend

```bash
cd aletheia-backend

# Copy environment template
cp .env.example .env

# Set DATABASE_URL in .env:
# DATABASE_URL=postgres://user:password@localhost/aletheia

# Run database migrations
cargo sqlx migrate run

# Build and run the server
cargo run --release
```

The API will be available at `http://localhost:8080`.

### 3. Set up the Frontend

```bash
cd ../aletheia-fixed

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### 4. Run with Docker (Recommended for Production)

```bash
# Build the unified container
docker build -t aletheia .

# Run with environment variables
docker run -p 8080:8080 \
  -e DATABASE_URL=postgres://user:password@host/aletheia \
  -e JWT_SECRET=$(openssl rand -base64 48) \
  -e SERVER_SIGNING_KEY=$(openssl genpkey -algorithm ED25519 | openssl pkey -outform DER | base64 -w 0) \
  aletheia
```

---

## API Reference

### Base URL
```
https://api.aletheia.io/v2
```

### Authentication
Bearer token required for all endpoints.

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v2/verify` | Verify media provenance |
| `POST` | `/api/v2/sign` | Sign a capture bundle |
| `POST` | `/api/v2/attest` | Hardware attestation validation |
| `POST` | `/api/v2/lineage` | Query provenance lineage |
| `GET/POST` | `/api/v2/manifest` | Verifiable capture manifests |
| `POST` | `/api/v2/anchor` | Blockchain anchoring |
| `GET` | `/health` | Health check |
| `GET` | `/ready` | Readiness check (DB ping) |

### Example: Verify a Signed Media File

```bash
curl -X POST https://api.aletheia.io/v2/verify \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "media_hash": "a3f5c2d8e1b4...",
    "bundle": {
      "version": 2,
      "media_hash": "a3f5c2d8e1b4...",
      "timestamp": "2025-01-15T10:30:00Z",
      "device_id": "dev_1234567890abcdef",
      "signature": "base64encodedSignature...",
      "public_key": "base64encodedPublicKey...",
      "nonce": "base64nonce..."
    }
  }'
```

**Response:**

```json
{
  "valid": true,
  "trust_level": "PROVENANCE_VERIFIED",
  "trust_score": 100,
  "hash_match": true,
  "signature_valid": true,
  "timestamp_valid": true,
  "replay_protected": true,
  "certificate_id": "cert_lx8k2m",
  "provenance_scope_note": "Verification confirms provenance integrity, not independent semantic truth of depicted content.",
  "checks": [
    { "label": "SHA-256 media hash matches bundle", "passed": true },
    { "label": "Ed25519 signature valid", "passed": true }
  ]
}
```

### Trust States

| State | Score | Meaning |
|-------|-------|---------|
| `PROVENANCE_VERIFIED` | 100 | All checks passed, hardware attested |
| `PARTIALLY_TRUSTED` | 50-99 | Software verification only, no hardware attestation |
| `UNVERIFIED` | 0-49 | Failed checks or incomplete data |
| `COMPROMISED` | 0 | Hash mismatch, invalid signature, or replay detected |

For complete API documentation, visit `/docs` on any running Aletheia instance.

---

## Deployment

### Deploy to Render (One-Click)

The repository includes a `render.yaml` blueprint for one-click deployment:

1. Fork this repository
2. Create a new **Blueprint Instance** on [Render](https://render.com)
3. Connect your forked repository
4. Render will automatically:
   - Create a PostgreSQL database
   - Build and deploy the Docker container
   - Configure health checks and environment variables

**Required secrets** (set in Render dashboard):

| Secret | Generation Command |
|--------|-------------------|
| `JWT_SECRET` | `openssl rand -base64 48` |
| `SERVER_SIGNING_KEY` | `openssl genpkey -algorithm ED25519 \| openssl pkey -outform DER \| base64 -w 0` |

**Optional secrets**:

| Secret | Purpose |
|--------|---------|
| `APPLE_APP_ID` | Apple App Attest (format: `TeamID.BundleID`) |
| `ANDROID_PACKAGE` | Play Integrity (format: `com.example.app`) |
| `POLYGON_RPC_URL` | Blockchain anchoring (e.g., `https://polygon-rpc.com`) |
| `POLYGON_SIGNER_KEY` | Polygon wallet private key |
| `ANCHOR_CONTRACT_ADDRESS` | Deployed anchor contract |

### Manual Deployment

Any platform supporting Docker can run Aletheia:

```bash
# Build
docker build -t aletheia .

# Run
docker run -p 8080:8080 \
  -e DATABASE_URL=<postgres-url> \
  -e JWT_SECRET=<secret> \
  -e SERVER_SIGNING_KEY=<key> \
  aletheia
```

The container exposes:
- `/api/v2/*` — REST API handlers
- `/health` — Health check
- `/ready` — Readiness check (DB ping)
- `/*` — React SPA (static files with SPA fallback)

---

## Environment Variables

### Backend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | `8080` | Server port |
| `RUST_LOG` | No | `info` | Log level |
| `JWT_SECRET` | Yes | — | Secret for JWT tokens |
| `SERVER_SIGNING_KEY` | Yes | — | Ed25519 private key (DER, base64) |
| `ATTESTATION_STRICT` | No | `false` | Require hardware attestation |
| `NONCE_TTL_SECS` | No | `172800` | Nonce time-to-live (48h) |
| `RATE_LIMIT_VERIFY` | No | `1000` | Verification rate limit |
| `APPLE_APP_ID` | No | — | Apple App Attest app ID |
| `ANDROID_PACKAGE` | No | — | Play Integrity package name |
| `POLYGON_RPC_URL` | No | — | Polygon RPC endpoint |
| `POLYGON_SIGNER_KEY` | No | — | Polygon signer private key |
| `ANCHOR_CONTRACT_ADDRESS` | No | — | Anchor contract address |

---

## Security Model

### Threats Addressed

| Threat | Mitigation |
|--------|-----------|
| **Media tampering** | SHA-256 hash — any byte change invalidates verification |
| **Signature forgery** | Ed25519 — cryptographically secure signatures |
| **Replay attacks** | Cryptographic nonce + timestamp validation with monotonic counters |
| **Key extraction** | Hardware-bound keys (Secure Enclave/StrongBox/TPM) — keys never leave device |
| **Fake app signing** | App Attest (iOS) / Play Integrity (Android) — proves genuine app & device |
| **Ledger tampering** | Hash-chained entries — each pins the previous hash |
| **Server compromise** | Offline verification — no server trust required |

### Trust Scoring

Aletheia uses a composite trust score (0-100):

- **Hardware security** (up to 100 points):
  - Secure Enclave / StrongBox / TPM active
  - App Attest / Play Integrity attestation passed
  - Biometric authentication gate
- **Software security** (up to 100 points):
  - HTTPS secure context
  - Web Crypto API active
  - Ed25519 signature verified
  - Anti-replay protection validated

---

## SDK Integration

### iOS (Swift)

```swift
import AletheiaSDK

// Initialize with hardware security
let aletheia = try await Aletheia(
    hardware: .secureEnclave,
    attest: .appAttest
)

// Capture and sign
let bundle = try await aletheia.capture(
    media: capturedImage,
    gps: location,
    disclosure: .cameraOriginal
)

// Verify
let result = try await aletheia.verify(bundle: bundle)
print("Trust score: \(result.trustScore)")
```

### Android (Kotlin)

```kotlin
import com.aletheia.sdk.Aletheia

// Initialize with StrongBox
val aletheia = Aletheia.Builder(context)
    .hardware(Hardware.StrongBox)
    .attestation(Attestation.PlayIntegrity)
    .build()

// Capture and sign
val bundle = aletheia.capture(
    media = capturedBitmap,
    gps = location,
    disclosure = Disclosure.CAMERA_ORIGINAL
)

// Verify
val result = aletheia.verify(bundle)
println("Trust score: ${result.trustScore}")
```

---

## Database Schema

Aletheia uses PostgreSQL with three core tables:

| Migration | Table | Purpose |
|-----------|-------|---------|
| `001_manifests.sql` | `provenance_manifests` | Signed capture bundles |
| `002_lineage.sql` | `lineage_entries` | DAG lineage tracking |
| `003_replay_nonces.sql` | `replay_nonces` | Anti-replay nonce store |

---

## Development

### Frontend Development

```bash
cd aletheia-fixed
npm install
npm run dev        # Dev server with HMR
npm run build      # Production build
npm run lint       # ESLint
npm run format     # Prettier
```

### Backend Development

```bash
cd aletheia-backend
cargo build        # Debug build
cargo run          # Run server
cargo test         # Run tests
cargo sqlx migrate run   # Apply migrations
cargo sqlx migrate revert # Rollback migrations
```

### Running Tests

```bash
# Backend tests
cd aletheia-backend
cargo test

# Frontend linting
cd aletheia-fixed
npm run lint
```

---

## Why Rust for the Backend?

Aletheia's core trust infrastructure requires:

- **Sub-millisecond signature verification** — Ed25519 + ECDSA at scale
- **Memory-safe cryptographic operations** — no GC pauses in hot paths
- **Replay attack prevention** — monotonic counter state must be lock-free
- **Immutable manifest storage** — append-only semantics enforced at the type level
- **Hardware attestation validation** — direct Apple/Google API integration without JS wrapper overhead

Rust with Axum provides all of these without compromise.

---

## Roadmap

- [x] Core provenance capture & verification
- [x] Hash-chained append-only ledger
- [x] Lineage tracking (Git-like provenance history)
- [x] Hardware attestation framework
- [x] iOS SDK with Secure Enclave
- [x] Android SDK with StrongBox
- [x] API with comprehensive endpoints
- [x] Docker containerization
- [x] Render deployment blueprint
- [ ] Blockchain anchoring (Polygon integration)
- [ ] Desktop TPM 2.0 support
- [ ] WebAuthn PRF extension
- [ ] Federation protocol (cross-instance verification)
- [ ] Browser extension for one-click verify
- [ ] Mobile app distribution (App Store / Play Store)

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code of Conduct
- Development workflow
- Pull request process
- Security disclosure

### Areas needing contribution

- Hardware SDK testing on physical devices
- Blockchain anchoring implementation
- Additional forensic analysis algorithms
- Documentation translations
- Performance benchmarking

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Ed25519-dalek](https://github.com/dalek-cryptography/ed25519-dalek) for high-performance signature verification
- [SQLx](https://github.com/launchbadge/sqlx) for compile-time checked SQL
- [Axum](https://github.com/tokio-rs/axum) for the web framework
- [tweetnacl-js](https://github.com/dchest/tweetnacl-js) for browser-based cryptography
- [shadcn/ui](https://ui.shadcn.com/) and [Radix UI](https://www.radix-ui.com/) for accessible components

---

<p align="center">
  <i>"Proof that what you saw actually happened."</i>
</p>

<p align="center">
  Built with cryptographic rigor by <a href="https://github.com/saieesh-code">@saieesh-code</a>
</p>
