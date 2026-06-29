//! Aletheia Server — production-ready, Render-compatible Rust backend.
//!
//! DATABASE_URL is required only at runtime, never at compile time.
//! No sqlx macros. No offline query cache. No nightly Rust.
//!
//! Static file serving: the React SPA is built into ./static by the
//! Dockerfile and served from there. Unknown paths fall back to
//! index.html so client-side React Router handles navigation.

use std::{sync::Arc, time::Duration};
use tower_http::cors::{CorsLayer, Any};
use axum::http::Method;
use axum::{
    routing::{get, post},
    Router,
};
use sqlx::postgres::PgPoolOptions;
use tower_http::{
    compression::CompressionLayer,
    limit::RequestBodyLimitLayer,
    request_id::{MakeRequestUuid, SetRequestIdLayer},
    services::{ServeDir, ServeFile},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tracing_subscriber::{fmt, EnvFilter};

mod config;
mod error;
mod models;
mod routes;
mod services;
mod state;

use state::{AppState, SharedState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // ── Load .env (dev only; production uses real env vars) ───────────────────
    dotenvy::dotenv().ok();

    // ── Tracing ───────────────────────────────────────────────────────────────
    fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("aletheia_server=info,tower_http=warn")),
        )
        .json()
        .init();

    // ── Config ────────────────────────────────────────────────────────────────
    let cfg  = config::Config::from_env()?;
    let port = cfg.port;

    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        port,
        "Aletheia server starting"
    );

    // ── Database pool ─────────────────────────────────────────────────────────
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&cfg.database_url)
        .await
        .map_err(|e| anyhow::anyhow!("Database connection failed: {e}\nCheck DATABASE_URL."))?;

    tracing::info!("Database connected");

    // ── Run migrations (SQL files embedded at compile time — no DB needed) ────
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| anyhow::anyhow!("Migration failed: {e}"))?;

    tracing::info!("Migrations applied");

    // ── Shared state ──────────────────────────────────────────────────────────
    let state: SharedState = Arc::new(AppState { db: pool, config: cfg });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    // ── Static SPA service ────────────────────────────────────────────────────
    // Serves React SPA from ./static (populated by Dockerfile build stage).
    // Unknown paths (React client-side routes) fall back to index.html so
    // page refreshes work correctly on any route.
    let spa_service = ServeDir::new("static")
        .not_found_service(ServeFile::new("static/index.html"));

    // ── Router ────────────────────────────────────────────────────────────────
    let app = Router::new()
        // ── Infrastructure ──────────────────────────────────────────────────
        .route("/health", get(routes::health::health))
        .route("/ready",  get(routes::health::ready))
        // ── Verification ────────────────────────────────────────────────────
        .route("/api/v2/verify",                     post(routes::verify::handler))
        // ── Manifests ───────────────────────────────────────────────────────
        .route("/api/v2/manifest",                   post(routes::manifest::create))
        .route("/api/v2/manifest/:id",               get(routes::manifest::get))
        // ── Lineage ─────────────────────────────────────────────────────────
        .route("/api/v2/lineage",                    post(routes::lineage::create_node))
        .route("/api/v2/lineage/:id",                get(routes::lineage::get_chain))
        .route("/api/v2/lineage/:id/verify",         get(routes::lineage::verify_chain))
        // ── Certificates ────────────────────────────────────────────────────
        .route("/api/v2/certificate",                post(routes::certificate::issue))
        .route("/api/v2/certificate/:id",            get(routes::certificate::get))
        // ── Audit ───────────────────────────────────────────────────────────
        .route("/api/v2/audit/:id",                  get(routes::audit::get_trail))
        // ── Blockchain anchor (mocked when no RPC config) ───────────────────
        .route("/api/v2/anchor",                     post(routes::anchor::anchor))
        .route("/api/v2/anchor/:id",                 get(routes::anchor::get))
        // ── State ───────────────────────────────────────────────────────────
        .with_state(state)
        // ── React SPA fallback — must come AFTER API routes ─────────────────
        // Any path not matched above (including /, /capture, /verify, etc.)
        // is served from ./static, falling back to index.html.
        .fallback_service(spa_service)
        .layer(cors)
        // ── Middleware (applied outermost-first) ─────────────────────────────
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(TimeoutLayer::new(Duration::from_secs(30)))
        .layer(RequestBodyLimitLayer::new(10 * 1024 * 1024)); // 10 MB

    // ── Listen ────────────────────────────────────────────────────────────────
    let addr     = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!(%addr, "Listening");
    axum::serve(listener, app).await?;

    Ok(())
}
