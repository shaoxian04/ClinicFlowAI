package my.cliniflow.controller.biz.patient.response;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record PatientVisitDetailResponse(
    UUID visitId,
    OffsetDateTime finalizedAt,
    String summaryEn,
    String summaryMs,
    List<Medication> medications
) {
    public record Medication(String name, String dosage, String frequency) {}
}
