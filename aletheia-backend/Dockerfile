# =============================================================================
# Aletheia Backend — Render-compatible multi-stage Dockerfile
#
# DATABASE_URL is NOT required at build time.
# Only needed at runtime when the server starts.
# =============================================================================

# ─── Stage 1: dependency cache ────────────────────────────────────────────────
# Build with a stub main so Docker caches all crate downloads separately
# from source changes.
FROM rust:latest AS deps

WORKDIR /build

COPY Cargo.toml ./

# Create a minimal stub so cargo can resolve and compile all dependencies
RUN mkdir -p src && \
    echo 'fn main() { println!("stub"); }' > src/main.rs && \
    cargo build --release && \
    rm -rf src \
           target/release/aletheia-server \
           target/release/deps/aletheia_server*

# ─── Stage 2: build the real binary ──────────────────────────────────────────
FROM deps AS builder

WORKDIR /build

# Copy real source + migration files
# (sqlx::migrate! reads SQL files at compile time — no DB connection needed)
COPY src        ./src
COPY migrations ./migrations

# Touch main.rs so Cargo knows to relink; deps layer is already cached above
RUN touch src/main.rs && cargo build --release

# ─── Stage 3: minimal runtime image ──────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        libssl3 \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 aletheia \
    && useradd  --uid 1001 --gid aletheia --shell /sbin/nologin aletheia

WORKDIR /app

COPY --from=builder /build/target/release/aletheia-server ./

# Optional: pre-built React SPA — populated by the unified root Dockerfile.
# If this directory is absent the API still works; static/* just returns 404.
# COPY --from=frontend /dist ./static

USER aletheia
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["./aletheia-server"]
