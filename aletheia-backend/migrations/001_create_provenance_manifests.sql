CREATE TABLE IF NOT EXISTS provenance_manifests (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_hash         TEXT        NOT NULL,
    device_id          TEXT,
    metadata           JSONB,
    signature          TEXT,
    verification_level TEXT        NOT NULL DEFAULT 'standard',
    immutable          BOOLEAN     NOT NULL DEFAULT false,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manifests_asset_hash ON provenance_manifests(asset_hash);
CREATE INDEX IF NOT EXISTS idx_manifests_device_id  ON provenance_manifests(device_id);
CREATE INDEX IF NOT EXISTS idx_manifests_created_at ON provenance_manifests(created_at DESC);
