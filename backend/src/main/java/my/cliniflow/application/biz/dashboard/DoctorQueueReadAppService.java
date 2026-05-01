package my.cliniflow.application.biz.dashboard;

import my.cliniflow.controller.biz.dashboard.response.DoctorQueueResponse;
import my.cliniflow.controller.biz.dashboard.response.DoctorQueueResponse.DayGroup;
import my.cliniflow.controller.biz.dashboard.response.DoctorQueueResponse.Item;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Lists draft SOAP notes (medical_reports.is_finalized = false) for the doctor's
 * review queue, grouped by the calendar day (Asia/Kuala_Lumpur) the draft was
 * created. Within each day, items are sorted by oldest first so the doctor
 * works through the backlog in arrival order.
 */
@Service
@Transactional(readOnly = true)
public class DoctorQueueReadAppService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");
    private static final int PREVIEW_LEN = 140;

    private final JdbcTemplate jdbc;

    public DoctorQueueReadAppService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public DoctorQueueResponse build() {
        OffsetDateTime now = OffsetDateTime.now();

        List<RawRow> rows = jdbc.query(
            "SELECT mr.visit_id, p.full_name, mr.subjective, mr.gmt_create " +
            "FROM medical_reports mr " +
            "JOIN visits v ON mr.visit_id = v.id " +
            "JOIN patients p ON v.patient_id = p.id " +
            "WHERE mr.is_finalized = false " +
            "ORDER BY mr.gmt_create ASC",
            (rs, n) -> new RawRow(
                rs.getObject(1, UUID.class),
                rs.getString(2),
                rs.getString(3),
                rs.getObject(4, OffsetDateTime.class)));

        Map<LocalDate, List<Item>> byDate = new LinkedHashMap<>();
        for (RawRow r : rows) {
            LocalDate day = r.draftedAt.atZoneSameInstant(KL).toLocalDate();
            long mins = Math.max(0L, ChronoUnit.MINUTES.between(r.draftedAt, now));
            Item item = new Item(r.visitId, r.patientName, preview(r.subjective), r.draftedAt, mins);
            byDate.computeIfAbsent(day, k -> new ArrayList<>()).add(item);
        }

        List<DayGroup> groups = new ArrayList<>(byDate.size());
        byDate.entrySet().stream()
            .sorted(Map.Entry.<LocalDate, List<Item>>comparingByKey().reversed())
            .forEach(e -> groups.add(new DayGroup(e.getKey(), e.getValue().size(), e.getValue())));

        return new DoctorQueueResponse(rows.size(), groups);
    }

    private static String preview(String s) {
        if (s == null) return "";
        String trimmed = s.strip();
        if (trimmed.length() <= PREVIEW_LEN) return trimmed;
        return trimmed.substring(0, PREVIEW_LEN).strip() + "…";
    }

    private record RawRow(UUID visitId, String patientName, String subjective, OffsetDateTime draftedAt) {}
}
