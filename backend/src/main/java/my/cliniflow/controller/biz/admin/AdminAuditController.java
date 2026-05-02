package my.cliniflow.controller.biz.admin;

import my.cliniflow.controller.base.WebResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Read-only admin endpoint for the PDPA audit log.
 *
 * <p>Returns a paginated, filterable view of {@code audit_log} rows, enriched
 * with the actor's email/name from the {@code users} table via a LEFT JOIN.
 * All mutation of {@code audit_log} is blocked at the DB trigger level.
 */
@RestController
@RequestMapping("/api/admin/audit")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAuditController {

    private static final int MAX_LIMIT = 200;
    private static final int DEFAULT_LIMIT = 50;

    private final JdbcTemplate jdbc;

    public AdminAuditController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public WebResult<Map<String, Object>> list(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(required = false)    String action,
            @RequestParam(required = false)    String resourceType,
            @RequestParam(required = false)    String from,
            @RequestParam(required = false)    String to) {

        limit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        int offset = Math.max(page, 0) * limit;

        StringBuilder where = new StringBuilder(" WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (action != null && !action.isBlank()) {
            where.append(" AND a.action = ?");
            params.add(action.toUpperCase());
        }
        if (resourceType != null && !resourceType.isBlank()) {
            where.append(" AND a.resource_type = ?");
            params.add(resourceType.toUpperCase());
        }
        if (from != null && !from.isBlank()) {
            where.append(" AND a.occurred_at >= ?::timestamptz");
            params.add(from);
        }
        if (to != null && !to.isBlank()) {
            where.append(" AND a.occurred_at <= ?::timestamptz");
            params.add(to);
        }

        String countSql = "SELECT COUNT(*) FROM audit_log a" + where;
        Long total = jdbc.queryForObject(countSql, Long.class, params.toArray());

        String dataSql = """
            SELECT a.id,
                   a.occurred_at,
                   a.actor_role,
                   a.action,
                   a.resource_type,
                   a.resource_id,
                   a.metadata,
                   u.email  AS actor_email,
                   u.full_name AS actor_name
            FROM audit_log a
            LEFT JOIN users u ON u.id = a.actor_user_id
            """ + where + " ORDER BY a.occurred_at DESC, a.id DESC LIMIT ? OFFSET ?";

        List<Object> dataParams = new ArrayList<>(params);
        dataParams.add(limit);
        dataParams.add(offset);

        List<Map<String, Object>> rows = jdbc.queryForList(dataSql, dataParams.toArray());

        return WebResult.ok(Map.of(
            "total", total != null ? total : 0L,
            "page", page,
            "limit", limit,
            "entries", rows
        ));
    }
}
