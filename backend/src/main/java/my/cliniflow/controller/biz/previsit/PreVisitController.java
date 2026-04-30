package my.cliniflow.controller.biz.previsit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.PreVisitWriteAppService;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.previsit.request.PreVisitTurnRequest;
import my.cliniflow.controller.biz.previsit.response.PreVisitSessionResponse;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/previsit")
public class PreVisitController {

    private final PreVisitWriteAppService svc;
    private final PatientReadAppService patients;
    private final VisitRepository visits;

    public PreVisitController(PreVisitWriteAppService svc,
                               PatientReadAppService patients,
                               VisitRepository visits) {
        this.svc = svc;
        this.patients = patients;
        this.visits = visits;
    }

    @PostMapping("/sessions")
    @PreAuthorize("hasRole('PATIENT')")
    public WebResult<PreVisitSessionResponse> start(Authentication auth) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
        PatientModel patient = patients.findByUserId(claims.userId())
            .orElseThrow(() -> new ResourceNotFoundException(
                "no patient profile for user: " + claims.userId()));
        return WebResult.ok(svc.startSession(patient.getId()));
    }

    @PostMapping("/sessions/{visitId}/turn")
    @PreAuthorize("hasRole('PATIENT')")
    public WebResult<PreVisitSessionResponse> turn(
        @PathVariable UUID visitId,
        @Valid @RequestBody PreVisitTurnRequest req,
        Authentication auth
    ) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
        PatientModel patient = patients.findByUserId(claims.userId())
            .orElseThrow(() -> new ResourceNotFoundException(
                "no patient profile for user: " + claims.userId()));
        VisitModel visit = visits.findById(visitId)
            .orElseThrow(() -> new ResourceNotFoundException("VISIT", visitId));
        if (!patient.getId().equals(visit.getPatientId())) {
            throw new BusinessException(ResultCode.FORBIDDEN, "visit does not belong to caller");
        }
        return WebResult.ok(svc.applyTurn(visitId, req.userMessage()));
    }
}
