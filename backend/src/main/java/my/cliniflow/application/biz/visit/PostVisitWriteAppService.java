package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;

import java.util.List;
import java.util.UUID;

public interface PostVisitWriteAppService {

    record MedicationInput(String name, String dosage, String frequency, String duration, String instructions) {}

    record PostVisitResult(
        PostVisitSummaryModel summary,
        List<MedicationModel> medications
    ) {}

    PostVisitResult generate(UUID visitId, List<MedicationInput> medInputs);
}
