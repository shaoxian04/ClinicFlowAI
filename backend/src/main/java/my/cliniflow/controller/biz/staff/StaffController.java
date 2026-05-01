package my.cliniflow.controller.biz.staff;

import my.cliniflow.application.biz.staff.StaffReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.staff.response.WaitingEntryDTO;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * Read-side endpoints for the front-desk staff portal.
 *
 * <p>{@code GET /api/staff/today} returns today's waiting list (all doctors,
 * status BOOKED or CHECKED_IN), sorted by scheduled slot start. The
 * "today" boundary is computed in {@code Asia/Kuala_Lumpur} so slots near
 * midnight are not silently mis-attributed to a UTC date.
 *
 * <p>All endpoints require {@code ROLE_STAFF}.
 */
@RestController
@RequestMapping("/api/staff")
@PreAuthorize("hasRole('STAFF')")
public class StaffController {

    private static final ZoneId CLINIC_ZONE = ZoneId.of("Asia/Kuala_Lumpur");

    private final StaffReadAppService reads;

    public StaffController(StaffReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping("/today")
    public WebResult<Map<String, Object>> today() {
        LocalDate today = OffsetDateTime.now().atZoneSameInstant(CLINIC_ZONE).toLocalDate();
        List<WaitingEntryDTO> waitingList = reads.today(today, CLINIC_ZONE);
        return WebResult.ok(Map.of("waitingList", waitingList));
    }
}
