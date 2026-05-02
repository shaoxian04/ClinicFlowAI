package my.cliniflow.application.biz.staff;

import my.cliniflow.application.biz.schedule.AppointmentNameResolver;
import my.cliniflow.controller.biz.staff.response.WaitingEntryDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.visit.repository.PreVisitReportRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class StaffReadAppServiceImpl implements StaffReadAppService {

    private static final List<AppointmentStatus> WAITING_STATUSES =
        List.of(AppointmentStatus.BOOKED, AppointmentStatus.CHECKED_IN);
    private static final String UNKNOWN_NAME = "—";

    private final AppointmentSlotRepository slots;
    private final AppointmentRepository appts;
    private final PreVisitReportRepository preVisitReports;
    private final AppointmentNameResolver nameResolver;

    public StaffReadAppServiceImpl(AppointmentSlotRepository slots,
                                    AppointmentRepository appts,
                                    PreVisitReportRepository preVisitReports,
                                    AppointmentNameResolver nameResolver) {
        this.slots = slots;
        this.appts = appts;
        this.preVisitReports = preVisitReports;
        this.nameResolver = nameResolver;
    }

    @Override
    @Transactional(readOnly = true)
    public List<WaitingEntryDTO> today(LocalDate date, ZoneId zone) {
        OffsetDateTime windowStart = ZonedDateTime.of(date,                LocalTime.MIN, zone).toOffsetDateTime();
        OffsetDateTime windowEnd   = ZonedDateTime.of(date.plusDays(1),    LocalTime.MIN, zone).toOffsetDateTime();

        List<AppointmentSlotModel> slotsToday = slots.findByStartAtBetween(windowStart, windowEnd);
        if (slotsToday.isEmpty()) {
            return List.of();
        }

        // slotId -> slot for downstream lookups (start time, doctor id).
        Map<UUID, AppointmentSlotModel> slotById = slotsToday.stream()
            .collect(Collectors.toMap(AppointmentSlotModel::getId, s -> s));

        List<AppointmentModel> rows = appts.findBySlotIdInAndStatusIn(
            slotById.keySet(), WAITING_STATUSES);
        if (rows.isEmpty()) {
            return List.of();
        }

        // Batch lookups to avoid N+1 reads.
        List<UUID> patientIds = rows.stream().map(AppointmentModel::getPatientId).distinct().toList();
        Map<UUID, String> patientNames = nameResolver.patientNames(patientIds);

        Set<UUID> doctorIds = rows.stream()
            .map(a -> slotById.get(a.getSlotId()).getDoctorId())
            .filter(java.util.Objects::nonNull)
            .collect(Collectors.toSet());
        Map<UUID, String> doctorNames = doctorIds.stream()
            .collect(java.util.HashMap::new,
                     (m, id) -> { String n = nameResolver.doctorName(id); if (n != null) m.put(id, n); },
                     java.util.HashMap::putAll);

        Set<UUID> visitIds = rows.stream().map(AppointmentModel::getVisitId).collect(Collectors.toSet());
        Set<UUID> submittedVisits = visitIds.isEmpty()
            ? Set.of()
            : new HashSet<>(preVisitReports.findVisitIdsIn(visitIds));

        return rows.stream()
            .map(a -> toEntry(a, slotById.get(a.getSlotId()), patientNames, doctorNames, submittedVisits))
            .sorted((x, y) -> {
                if (x.slotStartAt() == null && y.slotStartAt() == null) return 0;
                if (x.slotStartAt() == null) return 1;
                if (y.slotStartAt() == null) return -1;
                return x.slotStartAt().compareTo(y.slotStartAt());
            })
            .toList();
    }

    private WaitingEntryDTO toEntry(AppointmentModel a,
                                     AppointmentSlotModel slot,
                                     Map<UUID, String> patientNames,
                                     Map<UUID, String> doctorNames,
                                     Set<UUID> submittedVisits) {
        String preVisitStatus = submittedVisits.contains(a.getVisitId()) ? "submitted" : "none";
        String arrivedAt = a.getCheckedInAt() == null ? null : a.getCheckedInAt().toString();
        String slotStartAt = slot != null && slot.getStartAt() != null ? slot.getStartAt().toString() : null;
        String doctorName = slot != null ? doctorNames.getOrDefault(slot.getDoctorId(), UNKNOWN_NAME) : UNKNOWN_NAME;
        String patientName = patientNames.getOrDefault(a.getPatientId(), UNKNOWN_NAME);
        boolean checkedIn = a.getStatus() == AppointmentStatus.CHECKED_IN;

        return new WaitingEntryDTO(
            a.getId(),
            a.getPatientId(),
            patientName,
            preVisitStatus,
            arrivedAt,
            slotStartAt,
            a.getType().name(),
            doctorName,
            checkedIn);
    }
}
