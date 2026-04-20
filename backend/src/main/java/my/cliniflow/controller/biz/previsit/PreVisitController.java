package my.cliniflow.controller.biz.previsit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.PreVisitWriteAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.previsit.request.PreVisitTurnRequest;
import my.cliniflow.controller.biz.previsit.response.PreVisitSessionResponse;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/previsit")
public class PreVisitController {

    private final PreVisitWriteAppService svc;

    public PreVisitController(PreVisitWriteAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/sessions")
    public WebResult<PreVisitSessionResponse> start() {
        // Day 1: hardcoded seeded patient. Day 3 replaces with a patients lookup
        // by the authenticated user's user_id.
        UUID patientId = UUID.fromString("00000000-0000-0000-0000-000000000010");
        return WebResult.ok(svc.startSession(patientId));
    }

    @PostMapping("/sessions/{visitId}/turn")
    public WebResult<PreVisitSessionResponse> turn(
        @PathVariable UUID visitId,
        @Valid @RequestBody PreVisitTurnRequest req
    ) {
        return WebResult.ok(svc.applyTurn(visitId, req.userMessage()));
    }
}
