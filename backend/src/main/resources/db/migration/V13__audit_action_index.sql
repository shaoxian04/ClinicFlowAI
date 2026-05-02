-- V13: Index on audit_log.action for admin audit-log filtering
-- Apply manually in Supabase SQL editor. Idempotent.

CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action, occurred_at DESC);
