CREATE TABLE IF NOT EXISTS lineage_nodes (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id  UUID        REFERENCES lineage_nodes(id) ON DELETE SET NULL,
    asset_hash TEXT        NOT NULL,
    device_id  TEXT,
    operation  TEXT        NOT NULL DEFAULT 'capture',
    metadata   JSONB,
    signature  TEXT,
    depth      INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_asset_hash ON lineage_nodes(asset_hash);
CREATE INDEX IF NOT EXISTS idx_lineage_parent_id  ON lineage_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_lineage_created_at ON lineage_nodes(created_at DESC);
