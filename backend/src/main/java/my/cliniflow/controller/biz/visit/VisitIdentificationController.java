package my.cliniflow.controller.biz.visit;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitIdentificationReadAppService;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.response.VisitIdentificationDTO;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
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

    public VisitIdentificationController(
            VisitIdentificationReadAppService identificationReads,
            PatientReadAppService patientReads) {
        this.identificationReads = identificationReads;
        this.patientReads = patientReads;
    }

    /**
     * Returns the combined identification block — clinic, patient, doctor, visit —
     * for a given visit. PATIENT callers may only fetch their own visits.
     */
    @GetMapping("/{visitId}/identification")
    public WebResult<VisitIdentificationDTO> getIdentification(
            @PathVariable UUID visitId,
            Authentication auth) {

        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();

        VisitIdentificationInfo info;
        try {
            info = identificationReads.assemble(visitId);
        } catch (IllegalArgumentException e) {
            return WebResult.error(ResultCode.NOT_FOUND, e.getMessage());
        }

        if ("PATIENT".equals(claims.role().name())) {
            PatientModel ownPatient = patientReads.findByUserId(claims.userId()).orElse(null);
            if (ownPatient == null || !ownPatient.getId().equals(info.visit().patientId())) {
                return WebResult.error(ResultCode.FORBIDDEN, "Visit not yours");
            }
        }

        return WebResult.ok(VisitIdentificationDTO.from(info));
    }
}
