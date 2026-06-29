use std::sync::Arc;
use crate::config::Config;

pub struct AppState {
    pub db:     sqlx::PgPool,
    pub config: Config,
}

pub type SharedState = Arc<AppState>;
