package my.cliniflow.controller.biz.visit.response;

import java.util.List;
import java.util.UUID;

public record PostVisitResponse(
    UUID visitId,
    String summaryEn,
    String summaryMs,
    List<Medication> medications
) {
    public record Medication(UUID id, String name, String dosage, String frequency) {}
}
