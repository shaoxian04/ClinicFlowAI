package my.cliniflow.controller.biz.visit;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitIdentificationReadAppService;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.response.VisitIdentificationDTO;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/visits")
@PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN','PATIENT')")
public class VisitIdentificationController {

    private final VisitIdentificationReadAppService identificationReads;
    private final PatientReadAppService patientReads;
    private final VisitRepository visits;

    public VisitIdentificationController(
            VisitIdentificationReadAppService identificationReads,
            PatientReadAppService patientReads,
            VisitRepository visits) {
        this.identificationReads = identificationReads;
        this.patientReads = patientReads;
        this.visits = visits;
    }

    /**
     * Returns the combined identification block — clinic, patient, doctor, visit —
     * for a given visit. PATIENT callers may only fetch their own visits.
     * Ownership is checked before assembly to avoid unnecessary NRIC decryption.
     */
    @GetMapping("/{visitId}/identification")
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN','PATIENT')")
    public WebResult<VisitIdentificationDTO> getIdentification(
            @PathVariable UUID visitId,
            Authentication auth) {

        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();

        if ("PATIENT".equals(claims.role().name())) {
            UUID ownPatientId = patientReads.findByUserId(claims.userId())
                    .map(p -> p.getId()).orElse(null);
            UUID visitPatientId = visits.findById(visitId)
                    .map(v -> v.getPatientId()).orElse(null);
            if (ownPatientId == null || visitPatientId == null
                    || !ownPatientId.equals(visitPatientId)) {
                return WebResult.error(ResultCode.FORBIDDEN, "You don't have permission to view this prescription.");
            }
        }

        VisitIdentificationInfo info = identificationReads.assemble(visitId);
        return WebResult.ok(VisitIdentificationDTO.from(info));
    }
}
