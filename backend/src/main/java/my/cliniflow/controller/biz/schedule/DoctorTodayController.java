package my.cliniflow.controller.biz.schedule;

import my.cliniflow.application.biz.schedule.converter.AppointmentModel2DTOConverter;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
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
    private final UUID doctorId;

    public DoctorTodayController(AppointmentRepository appts,
                                  AppointmentSlotRepository slots,
                                  AppointmentModel2DTOConverter converter,
                                  @Value("${cliniflow.dev.seeded-doctor-pk}") String doctorId) {
        this.appts = appts;
        this.slots = slots;
        this.converter = converter;
        this.doctorId = UUID.fromString(doctorId);
    }

    /**
     * Returns all BOOKED appointments for today, ordered by slot start time (ascending).
     * Time boundaries are computed in Asia/Kuala_Lumpur to avoid midnight attribution errors.
     */
    @GetMapping("/today")
    public WebResult<List<AppointmentDTO>> today() {
        LocalDate today = OffsetDateTime.now().atZoneSameInstant(KL).toLocalDate();
        OffsetDateTime dayStart = ZonedDateTime.of(today, LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime dayEnd   = ZonedDateTime.of(today.plusDays(1), LocalTime.MIN, KL).toOffsetDateTime();
        List<AppointmentDTO> result = appts
            .findByDoctorAndDayWindow(doctorId, dayStart, dayEnd,
                List.of(AppointmentStatus.BOOKED.name()))
            .stream()
            .map(a -> {
                var slot = slots.findById(a.getSlotId()).orElse(null);
                return slot != null ? converter.convert(a, slot) : converter.convert(a);
            })
            .sorted((a, b) -> {
                if (a.startAt() == null && b.startAt() == null) return 0;
                if (a.startAt() == null) return 1;
                if (b.startAt() == null) return -1;
                return a.startAt().compareTo(b.startAt());
            })
            .toList();
        return WebResult.ok(result);
    }
}
