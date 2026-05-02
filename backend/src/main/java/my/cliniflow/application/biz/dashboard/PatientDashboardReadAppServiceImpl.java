package my.cliniflow.application.biz.dashboard;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.schedule.AppointmentReadAppService;
import my.cliniflow.application.biz.visit.ConditionMixExtractor;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.biz.dashboard.response.PatientDashboardResponse;
import my.cliniflow.controller.biz.dashboard.response.PatientDashboardResponse.*;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class PatientDashboardReadAppServiceImpl implements PatientDashboardReadAppService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final JdbcTemplate jdbc;
    private final ConditionMixExtractor extractor;
    private final PatientReadAppService patientReads;
    private final AppointmentReadAppService apptReads;

    public PatientDashboardReadAppServiceImpl(JdbcTemplate jdbc,
                                               ConditionMixExtractor extractor,
                                               PatientReadAppService patientReads,
                                               AppointmentReadAppService apptReads) {
        this.jdbc = jdbc;
        this.extractor = extractor;
        this.patientReads = patientReads;
        this.apptReads = apptReads;
    }

    @Override
    public PatientDashboardResponse build(UUID userId) {
        UUID patientId = patientReads.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("patient profile not found: " + userId))
            .getId();

        LocalDate today = OffsetDateTime.now().atZoneSameInstant(KL).toLocalDate();
        OffsetDateTime sixMonthsAgo = ZonedDateTime.of(today.minusMonths(6), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime fourteenAgo = ZonedDateTime.of(today.minusDays(14), java.time.LocalTime.MIN, KL).toOffsetDateTime();

        AppointmentDTO next = apptReads.listMine(userId, AppointmentStatus.BOOKED).stream()
            .filter(a -> a.startAt() != null && a.startAt().isAfter(OffsetDateTime.now()))
            .min(Comparator.comparing(AppointmentDTO::startAt))
            .orElse(null);

        long pastConsultations = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports mr JOIN visits v ON mr.visit_id = v.id " +
            "WHERE v.patient_id = ? AND mr.is_finalized = true",
            Long.class, patientId);

        long activeMedications = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medications m JOIN visits v ON m.visit_id = v.id " +
            "WHERE v.patient_id = ? AND m.gmt_create >= ?",
            Long.class, patientId, fourteenAgo);

        long allergies = jdbc.query(
            "SELECT drug_allergies FROM patient_clinical_profiles WHERE patient_id = ?",
            ps -> ps.setObject(1, patientId),
            rs -> {
                if (!rs.next()) return 0L;
                String json = rs.getString(1);
                if (json == null || json.isBlank() || json.equals("[]")) return 0L;
                int depth = 0, count = 1;
                boolean any = false;
                for (char c : json.toCharArray()) {
                    if (c == '[' || c == '{') depth++;
                    else if (c == ']' || c == '}') depth--;
                    else if (c == ',' && depth == 1) count++;
                    else if (!Character.isWhitespace(c) && c != '[' && c != ']') any = true;
                }
                return any ? (long) count : 0L;
            });

        LocalDate lastVisit = jdbc.query(
            "SELECT MAX(CAST(mr.finalized_at AT TIME ZONE 'Asia/Kuala_Lumpur' AS DATE)) " +
            "FROM medical_reports mr JOIN visits v ON mr.visit_id = v.id " +
            "WHERE v.patient_id = ? AND mr.is_finalized = true",
            ps -> ps.setObject(1, patientId),
            rs -> rs.next() ? rs.getObject(1, LocalDate.class) : null);

        // Timeline — finalized visits + upcoming bookings, last 6 months window.
        List<TimelinePoint> timeline = new ArrayList<>();
        jdbc.query(
            "SELECT CAST(mr.finalized_at AT TIME ZONE 'Asia/Kuala_Lumpur' AS DATE), mr.subjective " +
            "FROM medical_reports mr JOIN visits v ON mr.visit_id = v.id " +
            "WHERE v.patient_id = ? AND mr.is_finalized = true AND mr.finalized_at >= ? " +
            "ORDER BY mr.finalized_at",
            ps -> { ps.setObject(1, patientId); ps.setObject(2, sixMonthsAgo); },
            rs -> { timeline.add(new TimelinePoint(
                rs.getObject(1, LocalDate.class), "FINALIZED", extractor.classify(rs.getString(2)))); });
        apptReads.listMine(userId, AppointmentStatus.BOOKED).stream()
            .filter(a -> a.startAt() != null && a.startAt().isAfter(OffsetDateTime.now()))
            .forEach(a -> timeline.add(new TimelinePoint(
                a.startAt().atZoneSameInstant(KL).toLocalDate(), "UPCOMING", "Booked")));
        timeline.sort(Comparator.comparing(TimelinePoint::date));

        return new PatientDashboardResponse(
            next,
            new Stats(pastConsultations, activeMedications, allergies, lastVisit),
            timeline);
    }
}
