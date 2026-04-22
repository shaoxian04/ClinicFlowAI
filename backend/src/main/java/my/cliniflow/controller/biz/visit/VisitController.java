package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.VisitReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.request.NotesTextRequest;
import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.controller.biz.visit.response.VisitSummaryResponse;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/visits")
public class VisitController {

    private final VisitReadAppService reads;

    public VisitController(VisitReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping
    public WebResult<List<VisitSummaryResponse>> list(Authentication auth) {
        UUID doctorId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(reads.listForDoctor(doctorId));
    }

    @GetMapping("/{visitId}")
    public WebResult<VisitDetailResponse> detail(@PathVariable UUID visitId) {
        return WebResult.ok(reads.detail(visitId));
    }

    @PostMapping("/{visitId}/notes-text")
    public WebResult<Map<String, String>> notesText(
        @PathVariable UUID visitId,
        @Valid @RequestBody NotesTextRequest req
    ) {
        return WebResult.ok(Map.of("transcript", req.text()));
    }
}
