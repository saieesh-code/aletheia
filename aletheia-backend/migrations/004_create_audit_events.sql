CREATE TABLE IF NOT EXISTS audit_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id   UUID        NOT NULL,
    entity_type TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    actor       TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity_id   ON audit_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_events(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_events(created_at DESC);
