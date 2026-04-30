package my.cliniflow.infrastructure.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Append-only writer for the PDPA audit_log table.
 * Triggers in V1 reject UPDATE/DELETE — never edit existing rows.
 */
@Component
public class AuditWriter {

    private final JdbcTemplate jdbc;

    public AuditWriter(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void append(String action,
                       String resourceType,
                       String resourceId,
                       UUID actorUserId,
                       String actorRole) {
        jdbc.update(
            "INSERT INTO audit_log(occurred_at, actor_user_id, actor_role, action, resource_type, resource_id)" +
            " VALUES (?,?,?,?,?,?)",
            OffsetDateTime.now(), actorUserId, actorRole, action, resourceType, resourceId
        );
    }
}
