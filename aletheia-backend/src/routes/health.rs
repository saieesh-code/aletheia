use axum::{extract::State, Json};
use serde_json::{json, Value};

use crate::state::SharedState;

pub async fn health() -> Json<Value> {
    Json(json!({
        "status":  "ok",
        "service": "aletheia-server",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

pub async fn ready(State(state): State<SharedState>) -> Json<Value> {
    let db_ok = sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .is_ok();

    Json(json!({
        "status":   if db_ok { "ready" } else { "degraded" },
        "database": if db_ok { "ok" }   else { "unreachable" },
    }))
}
