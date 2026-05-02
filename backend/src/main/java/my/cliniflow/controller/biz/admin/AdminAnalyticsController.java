package my.cliniflow.controller.biz.admin;

import my.cliniflow.controller.base.WebResult;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Admin analytics: 4 KPI counters + 30-day appointment series.
 *
 * <p>All queries are read-only aggregates. The 30-day series is keyed by
 * ISO date string so the frontend can render a sparkline without extra parsing.
 */
@RestController
@RequestMapping("/api/admin/analytics")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAnalyticsController {

    private final JdbcTemplate jdbc;

    public AdminAnalyticsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public WebResult<Map<String, Object>> get() {

        Long totalPatients = jdbc.queryForObject(
            "SELECT COUNT(*) FROM patients", Long.class);

        Long totalAppointments = jdbc.queryForObject(
            "SELECT COUNT(*) FROM appointments WHERE status NOT IN ('CANCELLED')", Long.class);

        Long appointmentsToday = jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM appointments a
            JOIN appointment_slots s ON s.id = a.slot_id
            WHERE s.slot_start AT TIME ZONE 'Asia/Kuala_Lumpur' >= CURRENT_DATE
              AND s.slot_start AT TIME ZONE 'Asia/Kuala_Lumpur' < CURRENT_DATE + INTERVAL '1 day'
              AND a.status NOT IN ('CANCELLED')
            """, Long.class);

        Long finalized30d = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports WHERE finalized_at >= NOW() - INTERVAL '30 days'",
            Long.class);

        List<Map<String, Object>> series = jdbc.queryForList(
            """
            SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS date,
                   COUNT(a.id)                   AS count
            FROM generate_series(
                     CURRENT_DATE - INTERVAL '29 days',
                     CURRENT_DATE,
                     INTERVAL '1 day'
                 ) AS d(day)
            LEFT JOIN appointment_slots s
                   ON DATE(s.slot_start AT TIME ZONE 'Asia/Kuala_Lumpur') = d.day
            LEFT JOIN appointments a
                   ON a.slot_id = s.id AND a.status NOT IN ('CANCELLED')
            GROUP BY d.day
            ORDER BY d.day
            """);

        return WebResult.ok(Map.of(
            "kpis", Map.of(
                "totalPatients",      totalPatients != null ? totalPatients : 0L,
                "totalAppointments",  totalAppointments != null ? totalAppointments : 0L,
                "appointmentsToday",  appointmentsToday != null ? appointmentsToday : 0L,
                "finalized30d",       finalized30d != null ? finalized30d : 0L
            ),
            "appointmentSeries30d", series
        ));
    }
}
