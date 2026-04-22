-- V7__agent_turn_audit.sql — PDPA coverage for agent session log.
-- Every INSERT into agent_turns writes a row to audit_log.

CREATE OR REPLACE FUNCTION audit_log_agent_turn() RETURNS trigger AS $$
BEGIN
    INSERT INTO audit_log (
        actor_user_id, action, resource_type, resource_id,
        occurred_at, correlation_id, details
    ) VALUES (
        NULL,
        'AGENT_TURN_WRITE',
        'agent_turns',
        NEW.visit_id,
        NEW.created_at,
        gen_random_uuid(),
        jsonb_build_object(
            'agent_type', NEW.agent_type,
            'turn_index', NEW.turn_index,
            'role', NEW.role,
            'tool_call_name', NEW.tool_call_name
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agent_turns_audit
    AFTER INSERT ON agent_turns
    FOR EACH ROW EXECUTE FUNCTION audit_log_agent_turn();
