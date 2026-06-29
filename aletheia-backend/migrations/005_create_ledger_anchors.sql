CREATE TABLE IF NOT EXISTS ledger_anchors (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_id      UUID        REFERENCES provenance_manifests(id) ON DELETE SET NULL,
    asset_hash       TEXT        NOT NULL,
    proof_hash       TEXT        NOT NULL,
    network          TEXT        NOT NULL DEFAULT 'mock',
    transaction_hash TEXT,
    block_number     BIGINT,
    status           TEXT        NOT NULL DEFAULT 'pending',
    anchored_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anchors_manifest_id ON ledger_anchors(manifest_id);
CREATE INDEX IF NOT EXISTS idx_anchors_asset_hash  ON ledger_anchors(asset_hash);
