CREATE TABLE IF NOT EXISTS verification_certificates (
    id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_id UUID             REFERENCES provenance_manifests(id) ON DELETE SET NULL,
    asset_hash  TEXT             NOT NULL,
    trust_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    trust_level TEXT             NOT NULL DEFAULT 'none',
    checks      JSONB            NOT NULL DEFAULT '[]',
    issued_at   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ      NOT NULL,
    revoked     BOOLEAN          NOT NULL DEFAULT false,
    signature   TEXT             NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_certs_manifest_id ON verification_certificates(manifest_id);
CREATE INDEX IF NOT EXISTS idx_certs_asset_hash  ON verification_certificates(asset_hash);
