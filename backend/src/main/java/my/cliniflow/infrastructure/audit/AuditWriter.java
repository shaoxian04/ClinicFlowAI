package my.cliniflow.infrastructure.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Append-only writer for the PDPA audit_log table.
 * Triggers in V1 reject UPDATE/DELETE — never edit existing rows.
 */
@Component
public class AuditWriter {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public AuditWriter(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

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

    public void append(String action,
                       String resourceType,
                       String resourceId,
                       UUID actorUserId,
                       String actorRole,
                       Map<String, ?> metadata) {
        String json = metadata == null || metadata.isEmpty()
            ? "{}"
            : toJson(metadata);
        jdbc.update(
            "INSERT INTO audit_log(occurred_at, actor_user_id, actor_role, action, resource_type, resource_id, metadata)" +
            " VALUES (?,?,?,?,?,?,?::jsonb)",
            OffsetDateTime.now(), actorUserId, actorRole, action, resourceType, resourceId, json
        );
    }

    private String toJson(Map<String, ?> m) {
        try {
            return mapper.writeValueAsString(m);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("audit metadata not serializable, keys=" + m.keySet(), e);
        }
    }
}
