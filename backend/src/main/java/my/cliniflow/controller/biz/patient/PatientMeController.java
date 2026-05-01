package my.cliniflow.controller.biz.patient;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.dashboard.PatientDashboardReadAppService;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.patient.PatientWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.dashboard.response.PatientDashboardResponse;
import my.cliniflow.controller.biz.patient.request.PhoneUpdateRequest;
import my.cliniflow.controller.biz.patient.request.WhatsAppConsentUpdateRequest;
import my.cliniflow.controller.biz.patient.response.PatientMeResponse;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Patient self-service profile endpoints — phone update and WhatsApp consent.
 * Identity always derived from the JWT principal.
 */
@RestController
@RequestMapping("/api/patients/me")
@PreAuthorize("hasRole('PATIENT')")
public class PatientMeController {

    private final PatientReadAppService reads;
    private final PatientWriteAppService writes;
    private final PatientDashboardReadAppService dashboardReads;

    public PatientMeController(PatientReadAppService reads,
                               PatientWriteAppService writes,
                               PatientDashboardReadAppService dashboardReads) {
        this.reads = reads;
        this.writes = writes;
        this.dashboardReads = dashboardReads;
    }

    @GetMapping
    public WebResult<PatientMeResponse> me(Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(reads.getMyProfile(userId));
    }

    @GetMapping("/dashboard")
    public WebResult<PatientDashboardResponse> dashboard(Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(dashboardReads.build(userId));
    }

    @PutMapping("/whatsapp-consent")
    public WebResult<Void> setConsent(@Valid @RequestBody WhatsAppConsentUpdateRequest req,
                                      Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.updateWhatsAppConsent(userId, req.consent());
        return WebResult.ok(null);
    }

    @PutMapping("/phone")
    public WebResult<Void> setPhone(@Valid @RequestBody PhoneUpdateRequest req,
                                    Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.updatePhone(userId, req.phone());
        return WebResult.ok(null);
    }
}
