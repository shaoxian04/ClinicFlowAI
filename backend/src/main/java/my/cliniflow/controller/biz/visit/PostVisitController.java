package my.cliniflow.controller.biz.visit;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.visit.PostVisitWriteAppService;
import my.cliniflow.application.biz.visit.PostVisitWriteAppService.MedicationInput;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.visit.request.PostVisitGenerateRequest;
import my.cliniflow.controller.biz.visit.response.PostVisitResponse;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/postvisit")
public class PostVisitController {

    private final PostVisitWriteAppService svc;

    public PostVisitController(PostVisitWriteAppService svc) {
        this.svc = svc;
    }

    @PostMapping("/{visitId}/generate")
    public WebResult<PostVisitResponse> generate(
        @PathVariable UUID visitId,
        @Valid @RequestBody PostVisitGenerateRequest req
    ) {
        List<MedicationInput> inputs = req.medications() == null ? List.of() :
            req.medications().stream()
                .map(m -> new MedicationInput(m.name(), m.dosage(), m.frequency(), m.duration(), m.instructions()))
                .toList();
        PostVisitWriteAppService.PostVisitResult result = svc.generate(visitId, inputs);
        return WebResult.ok(toResponse(visitId, result.summary(), result.medications()));
    }

    private static PostVisitResponse toResponse(UUID visitId, PostVisitSummaryModel s, List<MedicationModel> meds) {
        List<PostVisitResponse.Medication> medDtos = meds.stream()
            .map(m -> new PostVisitResponse.Medication(m.getId(), m.getName(), m.getDosage(), m.getFrequency()))
            .toList();
        return new PostVisitResponse(visitId, s.getSummaryEn(), s.getSummaryMs(), medDtos);
    }
}
