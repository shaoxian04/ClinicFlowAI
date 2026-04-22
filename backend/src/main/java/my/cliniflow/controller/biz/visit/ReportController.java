// backend/src/main/java/my/cliniflow/controller/biz/visit/ReportController.java
package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.ReportReviewAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.request.ReportClarifySyncRequest;
import my.cliniflow.controller.biz.visit.request.ReportDraftPatchRequest;
import my.cliniflow.controller.biz.visit.request.ReportEditSyncRequest;
import my.cliniflow.controller.biz.visit.request.ReportGenerateSyncRequest;
import my.cliniflow.controller.biz.visit.response.ApproveResponse;
import my.cliniflow.controller.biz.visit.response.ChatTurnsResponse;
import my.cliniflow.controller.biz.visit.response.FinalizeResponse;
import my.cliniflow.controller.biz.visit.response.ReportReviewResult;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import my.cliniflow.infrastructure.security.JwtService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/visits/{visitId}/report")
public class ReportController {

    private static final Logger log = LoggerFactory.getLogger(ReportController.class);

    private final ReportReviewAppService svc;

    public ReportController(ReportReviewAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/generate-sync")
    public WebResult<ReportReviewResult> generateSync(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportGenerateSyncRequest req
    ) {
        log.info("[REVIEW] POST /generate-sync visit={}", visitId);
        return WebResult.ok(svc.generate(visitId, req.transcript(), req.specialty()));
    }

    @PostMapping("/clarify-sync")
    public WebResult<ReportReviewResult> clarifySync(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportClarifySyncRequest req
    ) {
        log.info("[REVIEW] POST /clarify-sync visit={}", visitId);
        return WebResult.ok(svc.clarify(visitId, req.answer()));
    }

    @PostMapping("/edit-sync")
    public WebResult<ReportReviewResult> editSync(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportEditSyncRequest req
    ) {
        log.info("[REVIEW] POST /edit-sync visit={}", visitId);
        return WebResult.ok(svc.edit(visitId, req.instruction()));
    }

    @PatchMapping("/draft")
    public WebResult<MedicalReportDto> patchDraft(
        @PathVariable UUID visitId,
        @Valid @RequestBody ReportDraftPatchRequest req
    ) {
        log.info("[REVIEW] PATCH /draft visit={} path={}", visitId, req.path());
        return WebResult.ok(svc.patchDraft(visitId, req.path(), req.value()));
    }

    @GetMapping("/chat")
    public WebResult<ChatTurnsResponse> getChat(@PathVariable UUID visitId) {
        log.info("[REVIEW] GET /chat visit={}", visitId);
        return WebResult.ok(svc.getChat(visitId));
    }

    @PostMapping("/approve")
    public WebResult<ApproveResponse> approve(@PathVariable UUID visitId) {
        log.info("[REVIEW] POST /approve visit={}", visitId);
        return WebResult.ok(svc.approve(visitId));
    }

    @PostMapping("/finalize")
    public WebResult<FinalizeResponse> finalizeReport(
        @PathVariable UUID visitId,
        Authentication auth
    ) {
        UUID doctorId = ((JwtService.Claims) auth.getPrincipal()).userId();
        log.info("[REVIEW] POST /finalize visit={} doctor={}", visitId, doctorId);
        return WebResult.ok(svc.finalize(visitId, doctorId));
    }
}
