package my.cliniflow.controller.biz.staff;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.staff.StaffReadAppService;
import my.cliniflow.application.biz.staff.StaffWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.staff.request.CheckinRequest;
import my.cliniflow.controller.biz.staff.response.WaitingEntryDTO;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Read- and write-side endpoints for the front-desk staff portal.
 *
 * <p>{@code GET /api/staff/today} returns today's waiting list (all doctors,
 * status BOOKED or CHECKED_IN), sorted by scheduled slot start. The
 * "today" boundary is computed in {@code Asia/Kuala_Lumpur} so slots near
 * midnight are not silently mis-attributed to a UTC date.
 *
 * <p>{@code POST /api/staff/checkin} idempotently flips an appointment to
 * {@code CHECKED_IN}. The acting staff user is derived server-side from the
 * JWT principal — never trusted from the request body.
 *
 * <p>All endpoints require {@code ROLE_STAFF}.
 */
@RestController
@RequestMapping("/api/staff")
@PreAuthorize("hasRole('STAFF')")
public class StaffController {

    private static final ZoneId CLINIC_ZONE = ZoneId.of("Asia/Kuala_Lumpur");

    private final StaffReadAppService reads;
    private final StaffWriteAppService writes;

    public StaffController(StaffReadAppService reads, StaffWriteAppService writes) {
        this.reads = reads;
        this.writes = writes;
    }

    @GetMapping("/today")
    public WebResult<Map<String, Object>> today() {
        LocalDate today = OffsetDateTime.now().atZoneSameInstant(CLINIC_ZONE).toLocalDate();
        List<WaitingEntryDTO> waitingList = reads.today(today, CLINIC_ZONE);
        return WebResult.ok(Map.of("waitingList", waitingList));
    }

    @PostMapping("/checkin")
    public WebResult<Void> checkin(@Valid @RequestBody CheckinRequest req,
                                    Authentication auth) {
        UUID actor = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.checkIn(req.appointmentId(), actor);
        return WebResult.ok(null);
    }
}
