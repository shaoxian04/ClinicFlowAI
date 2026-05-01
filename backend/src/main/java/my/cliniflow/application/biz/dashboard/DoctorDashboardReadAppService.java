package my.cliniflow.application.biz.dashboard;

import my.cliniflow.application.biz.visit.ConditionMixExtractor;
import my.cliniflow.controller.biz.dashboard.response.DoctorDashboardResponse;
import my.cliniflow.controller.biz.dashboard.response.DoctorDashboardResponse.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Aggregates the doctor's dashboard data into one read.
 *
 * <p>All time arithmetic in {@code Asia/Kuala_Lumpur} so KPIs match what the
 * doctor sees on the wall clock.
 */
@Service
@Transactional(readOnly = true)
public class DoctorDashboardReadAppService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final JdbcTemplate jdbc;
    private final ConditionMixExtractor extractor;
    private final UUID doctorPk;

    public DoctorDashboardReadAppService(
            JdbcTemplate jdbc,
            ConditionMixExtractor extractor,
            @Value("${cliniflow.dev.seeded-doctor-pk}") String doctorPk) {
        this.jdbc = jdbc;
        this.extractor = extractor;
        this.doctorPk = UUID.fromString(doctorPk);
    }

    public DoctorDashboardResponse build() {
        OffsetDateTime now = OffsetDateTime.now();
        LocalDate today = now.atZoneSameInstant(KL).toLocalDate();
        OffsetDateTime dayStart = ZonedDateTime.of(today, java.time.LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime dayEnd   = ZonedDateTime.of(today.plusDays(1), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        LocalDate from14 = today.minusDays(13);
        OffsetDateTime from14Start = ZonedDateTime.of(from14, java.time.LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime prior14Start = ZonedDateTime.of(from14.minusDays(14), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        LocalDate weekStart = today.minusDays(today.getDayOfWeek().getValue() - 1L);
        OffsetDateTime weekStartTs = ZonedDateTime.of(weekStart, java.time.LocalTime.MIN, KL).toOffsetDateTime();

        long awaitingReview = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports WHERE is_finalized = false", Long.class);

        long bookedToday = jdbc.queryForObject(
            "SELECT COUNT(*) FROM appointments a JOIN appointment_slots s ON a.slot_id = s.id " +
            "WHERE s.doctor_id = ? AND a.status = 'BOOKED' AND s.start_at >= ? AND s.start_at < ?",
            Long.class, doctorPk, dayStart, dayEnd);

        long finalizedThisWeek = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports WHERE is_finalized = true AND finalized_at >= ?",
            Long.class, weekStartTs);

        Long avgMinutes = jdbc.queryForObject(
            "SELECT EXTRACT(EPOCH FROM AVG(finalized_at - gmt_create))/60.0 " +
            "FROM medical_reports WHERE is_finalized = true AND finalized_at >= ?",
            (rs, n) -> { double v = rs.getDouble(1); return rs.wasNull() ? null : Math.round(v); },
            from14Start);

        // 14-day trend: build a contiguous date list, fill from grouped query.
        Map<LocalDate, Long> byDate = new HashMap<>();
        jdbc.query(
            "SELECT CAST(finalized_at AT TIME ZONE 'Asia/Kuala_Lumpur' AS DATE) AS d, COUNT(*) " +
            "FROM medical_reports WHERE is_finalized = true AND finalized_at >= ? GROUP BY 1",
            ps -> ps.setObject(1, from14Start),
            rs -> { byDate.put(rs.getObject(1, LocalDate.class), rs.getLong(2)); });
        List<TrendPoint> trend = new ArrayList<>(14);
        for (int i = 0; i < 14; i++) {
            LocalDate d = from14.plusDays(i);
            trend.add(new TrendPoint(d, byDate.getOrDefault(d, 0L)));
        }

        long current14 = trend.stream().mapToLong(TrendPoint::count).sum();
        long prior14 = jdbc.queryForObject(
            "SELECT COUNT(*) FROM medical_reports WHERE is_finalized = true AND finalized_at >= ? AND finalized_at < ?",
            Long.class, prior14Start, from14Start);
        double deltaPct = prior14 == 0 ? 0.0 : ((current14 - prior14) * 100.0) / prior14;

        // Condition mix — last 30 days finalized.
        OffsetDateTime from30 = ZonedDateTime.of(today.minusDays(29), java.time.LocalTime.MIN, KL).toOffsetDateTime();
        List<String> subjectives = jdbc.queryForList(
            "SELECT subjective FROM medical_reports WHERE is_finalized = true AND finalized_at >= ?",
            String.class, from30);
        Map<String, Long> tally = subjectives.stream()
            .map(extractor::classify)
            .collect(Collectors.groupingBy(java.util.function.Function.identity(), Collectors.counting()));
        long total = subjectives.size();
        List<ConditionMixSlice> mix = tally.entrySet().stream()
            .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
            .limit(5)
            .map(e -> new ConditionMixSlice(e.getKey(), e.getValue(), total == 0 ? 0.0 : (e.getValue() * 100.0) / total))
            .toList();

        // Recently finalized — last 5.
        List<RecentlyFinalized> recent = jdbc.query(
            "SELECT mr.visit_id, p.full_name, mr.subjective, mr.finalized_at " +
            "FROM medical_reports mr " +
            "JOIN visits v ON mr.visit_id = v.id " +
            "JOIN patients p ON v.patient_id = p.id " +
            "WHERE mr.is_finalized = true ORDER BY mr.finalized_at DESC LIMIT 5",
            (rs, n) -> new RecentlyFinalized(
                rs.getObject(1, UUID.class),
                rs.getString(2),
                extractor.classify(rs.getString(3)),
                rs.getObject(4, OffsetDateTime.class)));

        return new DoctorDashboardResponse(
            new Kpis(awaitingReview, bookedToday, finalizedThisWeek, avgMinutes),
            trend,
            new TrendDelta(current14, prior14, deltaPct),
            mix,
            recent);
    }
}
