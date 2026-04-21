package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.patient.PatientWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.patient.response.PatientVisitDetailResponse;
import my.cliniflow.controller.biz.patient.response.PatientVisitSummaryResponse;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/patient")
public class PatientController {

    private final PatientReadAppService reads;
    private final PatientWriteAppService writes;

    public PatientController(PatientReadAppService reads, PatientWriteAppService writes) {
        this.reads = reads;
        this.writes = writes;
    }

    @PostMapping("/consent")
    public WebResult<Void> recordConsent(Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.recordConsent(userId, OffsetDateTime.now());
        return WebResult.ok(null);
    }

    @GetMapping("/visits")
    public WebResult<List<PatientVisitSummaryResponse>> list(Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(reads.listForUser(userId));
    }

    @GetMapping("/visits/{visitId}")
    public WebResult<PatientVisitDetailResponse> detail(@PathVariable UUID visitId, Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(reads.detailForUser(userId, visitId));
    }
}
