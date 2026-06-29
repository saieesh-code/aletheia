use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub port:               u16,
    pub database_url:       String,
    pub jwt_secret:         String,
    pub server_signing_key: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        Ok(Self {
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "8080".into())
                .parse::<u16>()
                .context("PORT must be a valid port number (0–65535)")?,

            database_url: std::env::var("DATABASE_URL")
                .context("DATABASE_URL is required")?,

            jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| {
                tracing::warn!("JWT_SECRET not set — using insecure default (set in production)");
                "dev-insecure-jwt-secret-change-in-production-32ch".into()
            }),

            server_signing_key: std::env::var("SERVER_SIGNING_KEY").unwrap_or_default(),
        })
    }
}
