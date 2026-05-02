package my.cliniflow.controller.biz.staff;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.patient.PatientWriteAppService;
import my.cliniflow.application.biz.staff.StaffReadAppService;
import my.cliniflow.application.biz.staff.StaffWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.staff.request.CheckinRequest;
import my.cliniflow.controller.biz.staff.request.StaffWalkInRequest;
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
 */
@RestController
@RequestMapping("/api/staff")
@PreAuthorize("hasRole('STAFF')")
public class StaffController {

    private static final ZoneId CLINIC_ZONE = ZoneId.of("Asia/Kuala_Lumpur");

    private final StaffReadAppService reads;
    private final StaffWriteAppService writes;
    private final PatientWriteAppService patientWrite;

    public StaffController(StaffReadAppService reads,
                            StaffWriteAppService writes,
                            PatientWriteAppService patientWrite) {
        this.reads = reads;
        this.writes = writes;
        this.patientWrite = patientWrite;
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

    /**
     * Walk-in patient registration. If {@code email} is provided, also creates
     * a PATIENT user account (requires {@code password} ≥ 8 chars).
     * Returns the new patient profile id and optional user id.
     */
    @PostMapping("/patients")
    public WebResult<Map<String, Object>> registerWalkIn(
            @Valid @RequestBody StaffWalkInRequest req,
            Authentication auth) {
        UUID actor = ((JwtService.Claims) auth.getPrincipal()).userId();
        boolean createAccount = req.email() != null && !req.email().isBlank()
                && req.password() != null && !req.password().isBlank();
        PatientWriteAppService.RegistrationInput input = new PatientWriteAppService.RegistrationInput(
            req.fullName(),
            req.dateOfBirth(),
            req.gender(),
            req.phone(),
            createAccount ? req.email() : null,
            req.preferredLanguage() != null ? req.preferredLanguage() : "en",
            null,            // nationalId
            "STAFF_LED",
            null,            // consentVersion — staff-led; patient accepts separately
            createAccount,
            createAccount ? req.password() : null,
            null             // clinicalBaseline
        );
        PatientWriteAppService.RegistrationResult result =
            patientWrite.register(input, actor, "STAFF");
        Map<String, Object> data = new java.util.HashMap<>();
        data.put("patientId", result.patientId().toString());
        data.put("userId", result.userId() != null ? result.userId().toString() : null);
        return WebResult.ok(data);
    }
}
