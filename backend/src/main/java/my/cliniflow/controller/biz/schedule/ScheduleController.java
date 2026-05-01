package my.cliniflow.controller.biz.schedule;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.schedule.converter.AppointmentModel2DTOConverter;
import my.cliniflow.application.biz.schedule.converter.AppointmentSlotModel2DTOConverter;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.schedule.request.DayClosureRequest;
import my.cliniflow.controller.biz.schedule.request.WindowBlockRequest;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.controller.biz.schedule.response.DayScheduleResponse;
import my.cliniflow.controller.biz.schedule.response.SlotDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleDayOverrideRepository;
import my.cliniflow.domain.biz.schedule.service.AppointmentNoShowDomainService;
import my.cliniflow.domain.biz.schedule.service.SlotBlockDomainService;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Staff/receptionist schedule management — day view, closures, blocks,
 * override removal, and marking appointments as no-show.
 *
 * <p>All endpoints require {@code ROLE_STAFF}. Identity is derived from the
 * JWT principal in every mutating method — caller-supplied user ids are never
 * trusted.
 *
 * <p>URL note: the no-show endpoint lives under {@code /api/schedule/...} rather
 * than {@code /api/appointments/...} to keep all staff-facing schedule actions
 * in one cohesive controller. The patient-facing {@link AppointmentController}
 * retains ownership of self-service booking and cancellation.
 */
@RestController
@RequestMapping("/api/schedule")
@PreAuthorize("hasRole('STAFF')")
public class ScheduleController {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final AppointmentRepository appts;
    private final AppointmentSlotRepository slots;
    private final ScheduleDayOverrideRepository overrides;
    private final SlotBlockDomainService blockSvc;
    private final AppointmentNoShowDomainService noShowSvc;
    private final UserRepository users;
    private final AuditWriter audit;
    private final AppointmentSlotModel2DTOConverter slotConverter;
    private final AppointmentModel2DTOConverter apptConverter;
    private final UUID doctorId;

    public ScheduleController(
            AppointmentRepository appts,
            AppointmentSlotRepository slots,
            ScheduleDayOverrideRepository overrides,
            SlotBlockDomainService blockSvc,
            AppointmentNoShowDomainService noShowSvc,
            UserRepository users,
            AuditWriter audit,
            AppointmentSlotModel2DTOConverter slotConverter,
            AppointmentModel2DTOConverter apptConverter,
            @Value("${cliniflow.dev.seeded-doctor-pk}") String doctorId) {
        this.appts = appts;
        this.slots = slots;
        this.overrides = overrides;
        this.blockSvc = blockSvc;
        this.noShowSvc = noShowSvc;
        this.users = users;
        this.audit = audit;
        this.slotConverter = slotConverter;
        this.apptConverter = apptConverter;
        this.doctorId = UUID.fromString(doctorId);
    }

    /**
     * Returns all slots (any status) and all BOOKED appointments for the
     * requested calendar day, in clinic-local time (Asia/Kuala_Lumpur).
     */
    @GetMapping("/days/{date}")
    public WebResult<DayScheduleResponse> day(
            @PathVariable @DateTimeFormat(iso = ISO.DATE) LocalDate date) {
        OffsetDateTime dayStart = ZonedDateTime.of(date, LocalTime.MIN, KL).toOffsetDateTime();
        OffsetDateTime dayEnd   = ZonedDateTime.of(date.plusDays(1), LocalTime.MIN, KL).toOffsetDateTime();

        List<SlotDTO> slotDtos = Stream.of(SlotStatus.values())
            .flatMap(st -> slots.findByDoctorAndWindowAndStatus(doctorId, dayStart, dayEnd, st).stream())
            .map(slotConverter::convert)
            .sorted((a, b) -> a.startAt().compareTo(b.startAt()))
            .toList();

        List<AppointmentDTO> apptDtos = appts
            .findByDoctorAndDayWindow(doctorId, dayStart, dayEnd, List.of(AppointmentStatus.BOOKED.name()))
            .stream()
            .map(a -> {
                var slot = slots.findById(a.getSlotId()).orElse(null);
                return slot != null ? apptConverter.convert(a, slot) : apptConverter.convert(a);
            })
            .toList();

        return WebResult.ok(new DayScheduleResponse(date, slotDtos, apptDtos));
    }

    /**
     * Closes the entire day for the seeded doctor. Rejects with 409 if any
     * BOOKED appointment overlaps the day (via {@code BookingsInWindowException}).
     */
    @PostMapping("/days/{date}/closures")
    public WebResult<UUID> closeDay(
            @PathVariable @DateTimeFormat(iso = ISO.DATE) LocalDate date,
            @Valid @RequestBody DayClosureRequest req,
            Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        ScheduleDayOverrideModel saved = blockSvc.closeDay(doctorId, date, req.reason(), userId);
        String role = users.findById(userId).orElseThrow().getRole().name();
        audit.append("CREATE", "SCHEDULE_OVERRIDE", saved.getId().toString(), userId, role);
        return WebResult.ok(saved.getId());
    }

    /**
     * Blocks a sub-day time window for the seeded doctor. Rejects with 409 if
     * any BOOKED appointment overlaps the window.
     */
    @PostMapping("/days/{date}/blocks")
    public WebResult<UUID> blockWindow(
            @PathVariable @DateTimeFormat(iso = ISO.DATE) LocalDate date,
            @Valid @RequestBody WindowBlockRequest req,
            Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        ScheduleDayOverrideModel saved = blockSvc.blockWindow(
            doctorId, date, req.windowStart(), req.windowEnd(), req.reason(), userId);
        String role = users.findById(userId).orElseThrow().getRole().name();
        audit.append("CREATE", "SCHEDULE_OVERRIDE", saved.getId().toString(), userId, role);
        return WebResult.ok(saved.getId());
    }

    /**
     * Removes a schedule override by id. Returns 404 if the override does not
     * exist.
     */
    @DeleteMapping("/overrides/{id}")
    public WebResult<Void> removeOverride(@PathVariable UUID id, Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        overrides.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("schedule override not found: " + id));
        overrides.delete(id);
        String role = users.findById(userId).orElseThrow().getRole().name();
        audit.append("DELETE", "SCHEDULE_OVERRIDE", id.toString(), userId, role);
        return WebResult.ok(null);
    }

    /**
     * Marks a BOOKED appointment as NO_SHOW. Returns 409 (via
     * {@code IllegalStateException} handler) if the appointment is not in
     * BOOKED status.
     *
     * <p>URL: {@code POST /api/schedule/appointments/{id}/no-show}
     */
    @PostMapping("/appointments/{id}/no-show")
    public WebResult<Void> noShow(@PathVariable UUID id, Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        AppointmentModel a = noShowSvc.markNoShow(id);
        String role = users.findById(userId).orElseThrow().getRole().name();
        audit.append("UPDATE", "APPOINTMENT", a.getId().toString(), userId, role);
        return WebResult.ok(null);
    }
}
