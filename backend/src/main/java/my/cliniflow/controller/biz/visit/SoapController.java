package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.SoapWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.request.SoapDraftRequest;
import my.cliniflow.controller.biz.visit.request.SoapGenerateRequest;
import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/visits/{visitId}/soap")
public class SoapController {

    private final SoapWriteAppService svc;

    public SoapController(SoapWriteAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/generate")
    public WebResult<VisitDetailResponse.Soap> generate(@PathVariable UUID visitId, @Valid @RequestBody SoapGenerateRequest req) {
        MedicalReportModel r = svc.generateDraft(visitId, req.transcript());
        return WebResult.ok(toSoap(r));
    }

    @PutMapping
    public WebResult<VisitDetailResponse.Soap> saveDraft(@PathVariable UUID visitId, @Valid @RequestBody SoapDraftRequest req) {
        MedicalReportModel r = svc.saveDraft(visitId, req.subjective(), req.objective(), req.assessment(), req.plan());
        return WebResult.ok(toSoap(r));
    }

    @PostMapping("/finalize")
    public WebResult<VisitDetailResponse.Soap> finalize(
        @PathVariable UUID visitId,
        @Valid @RequestBody SoapDraftRequest req,
        Authentication auth
    ) {
        UUID doctorId = ((JwtService.Claims) auth.getPrincipal()).userId();
        MedicalReportModel r = svc.finalize(visitId, doctorId, req.subjective(), req.objective(), req.assessment(), req.plan());
        return WebResult.ok(toSoap(r));
    }

    private static VisitDetailResponse.Soap toSoap(MedicalReportModel r) {
        return new VisitDetailResponse.Soap(
            r.getSubjective(), r.getObjective(), r.getAssessment(), r.getPlan(),
            r.isFinalized(), r.getAiDraftHash()
        );
    }
}
