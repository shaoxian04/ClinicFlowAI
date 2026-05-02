package my.cliniflow.controller.biz.schedule;

import my.cliniflow.application.biz.schedule.AppointmentNameResolver;
import my.cliniflow.application.biz.schedule.converter.AppointmentModel2DTOConverter;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResultCode;
import org.springframework.format.annotation.DateTimeFormat.ISO;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Doctor's "today" view — all BOOKED appointments for today, ordered by slot start time.
 * Single-doctor MVP: hardcoded to the seeded doctor PK via {@code cliniflow.dev.seeded-doctor-pk}.
 * All endpoints require {@code ROLE_DOCTOR}.
 */
@RestController
@RequestMapping("/api/doctor/appointments")
@PreAuthorize("hasRole('DOCTOR')")
public class DoctorTodayController {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final AppointmentRepository appts;
    private final AppointmentSlotRepository slots;
    private final AppointmentModel2DTOConverter converter;
    private final AppointmentNameResolver nameResolver;
    private final JdbcTemplate jdbc;
    private final UUID doctorId;

    public DoctorTodayController(AppointmentRepository appts,
                                  AppointmentSlotRepository slots,
                                  AppointmentModel2DTOConverter converter,
                                  AppointmentNameResolver nameResolver,
                                  JdbcTemplate jdbc,
                                  @Value("${cliniflow.dev.seeded-doctor-pk}") String doctorId) {
        this.appts = appts;
        this.slots = slots;
        this.converter = converter;
        this.nameResolver = nameResolver;
        this.jdbc = jdbc;
        this.doctorId = UUID.fromString(doctorId);
    }

    /**
     * Returns all BOOKED appointments for today, ordered by slot start time (ascending).
     * Time boundaries are computed in Asia/Kuala_Lumpur to avoid midnight attribution errors.
     */
    @GetMapping("/today")
    public WebResult<List<AppointmentDTO>> today() {
        LocalDate today = OffsetDateTime.now().atZoneSameInstant(KL).toLocalDate();
        return WebResult.ok(rangeForDoctor(today, today.plusDays(1)));
    }

    /**
     * Returns BOOKED appointments for the doctor between {@code from} (inclusive)
     * and {@code to} (inclusive), expressed in {@code Asia/Kuala_Lumpur} calendar
     * days. Capped at 30 days to bound query size.
     *
     * <p>Examples:
     * <ul>
     *   <li>{@code ?from=2026-05-01&to=2026-05-04} — today + next 3 days (4 days total)</li>
     *   <li>{@code ?from=2026-05-15&to=2026-05-15} — single specific day</li>
     * </ul>
     */
    @GetMapping("/range")
    public WebResult<List<AppointmentDTO>> range(
            @RequestParam("from") @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam("to")   @DateTimeFormat(iso = ISO.DATE) LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "to must be on/after from");
        }
        if (ChronoUnit.DAYS.between(from, to) > 30) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "range must be <= 30 days");
        }
        return WebResult.ok(rangeForDoctor(from, to.plusDays(1)));
    }

    /** Half-open window [fromDay, toDayExclusive) in KL local time. */
    private List<AppointmentDTO> rangeForDoctor(LocalDate fromDay, LocalDate toDayExclusive) {
        OffsetDateTime windowStart = ZonedDateTime.of(fromDay, LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime windowEnd   = ZonedDateTime.of(toDayExclusive, LocalTime.MIN, KL).toOffsetDateTime();
        var rowsRaw = appts.findByDoctorAndDayWindow(doctorId, windowStart, windowEnd,
            List.of(AppointmentStatus.BOOKED.name()));

        // Drop appointments whose visit already has a medical_report row — they
        // belong in the "Awaiting review" tab (drafted/approved) or "Finalized"
        // tab (finalized). The Schedule tab shows only consultations that have
        // not yet been drafted by the doctor.
        Set<UUID> visitIdsWithReport = new HashSet<>();
        List<UUID> visitIds = rowsRaw.stream().map(a -> a.getVisitId()).filter(java.util.Objects::nonNull).toList();
        if (!visitIds.isEmpty()) {
            String inClause = "?" + ",?".repeat(visitIds.size() - 1);
            jdbc.query(
                "SELECT visit_id FROM medical_reports WHERE visit_id IN (" + inClause + ")",
                ps -> {
                    for (int i = 0; i < visitIds.size(); i++) {
                        ps.setObject(i + 1, visitIds.get(i));
                    }
                },
                rs -> { visitIdsWithReport.add(rs.getObject(1, UUID.class)); });
        }
        var rows = rowsRaw.stream()
            .filter(a -> a.getVisitId() == null || !visitIdsWithReport.contains(a.getVisitId()))
            .toList();

        // Batch-fetch patient names in one pass to avoid N+1 reads.
        java.util.Map<UUID, String> patientNames = nameResolver.patientNames(
            rows.stream().map(a -> a.getPatientId()).toList());
        String singleDoctorName = nameResolver.doctorName(doctorId);
        return rows.stream()
            .map(a -> {
                var slot = slots.findById(a.getSlotId()).orElse(null);
                AppointmentDTO base = slot != null ? converter.convert(a, slot) : converter.convert(a);
                return new AppointmentDTO(
                    base.id(), base.slotId(), base.startAt(), base.endAt(),
                    base.doctorId(), base.patientId(), base.visitId(), base.type(),
                    base.parentVisitId(), base.status(), base.cancelledAt(),
                    singleDoctorName, patientNames.get(a.getPatientId()));
            })
            .sorted((a, b) -> {
                if (a.startAt() == null && b.startAt() == null) return 0;
                if (a.startAt() == null) return 1;
                if (b.startAt() == null) return -1;
                return a.startAt().compareTo(b.startAt());
            })
            .toList();
    }
}
