# =============================================================================
# Aletheia — Unified Single-Service Dockerfile
# Stage 1: Build React SPA   (Node 20)
# Stage 2: Build Rust API    (Rust 1.78, matching original backend/Dockerfile)
# Stage 3: Minimal runtime   (Debian bookworm-slim)
# =============================================================================

# ─── Stage 1: React frontend ──────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

# Build tools needed by some npm postinstall scripts
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build/frontend

# Cache npm layer separately from source
COPY aletheia-fixed/package.json aletheia-fixed/package-lock.json ./
RUN npm ci

# Copy full frontend source and build the SPA
COPY aletheia-fixed/ ./
RUN npm run build
# Output: /build/frontend/dist/

# ─── Stage 2: Rust backend ────────────────────────────────────────────────────
FROM rust:1.78-slim-bookworm AS backend-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Cache Cargo dependency compilation separately from source
COPY aletheia-backend/Cargo.toml aletheia-backend/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null; rm -rf src target/release/aletheia-server target/release/deps/aletheia_server*

# Copy real backend source
COPY aletheia-backend/src ./src
COPY aletheia-backend/migrations ./migrations

# Copy the React dist into ./static — Axum will serve it
COPY --from=frontend-builder /build/frontend/dist ./static

# Build the real binary (deps already cached above)
RUN touch src/main.rs && cargo build --release

# ─── Stage 3: Minimal runtime ─────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 aletheia \
    && useradd  --uid 1001 --gid aletheia --shell /sbin/nologin aletheia

WORKDIR /app

# Binary
COPY --from=backend-builder /build/target/release/aletheia-server ./aletheia-server
# Static files (served by Axum from ./static relative to WORKDIR /app)
COPY --from=backend-builder /build/static ./static

USER aletheia
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=15s \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["./aletheia-server"]
