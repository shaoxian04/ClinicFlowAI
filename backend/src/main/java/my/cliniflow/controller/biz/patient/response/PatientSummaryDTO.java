package my.cliniflow.controller.biz.patient.response;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record PatientSummaryDTO(
    UUID id,
    String name,
    String email,
    String phone,
    LocalDate dateOfBirth,
    List<VisitPreview> visits
) {
    public record VisitPreview(UUID visitId, String finalizedAt, String summaryEnPreview) {}
}
