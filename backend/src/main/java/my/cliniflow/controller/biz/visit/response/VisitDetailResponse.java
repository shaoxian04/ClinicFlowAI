package my.cliniflow.controller.biz.visit.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record VisitDetailResponse(
    UUID visitId,
    UUID patientId,
    String patientName,
    VisitStatus status,
    Map<String, Object> preVisitStructured,
    Soap soap,
    OffsetDateTime createdAt,
    OffsetDateTime finalizedAt,
    MedicalReportDto reportDraft
) {
    public record Soap(
        String subjective,
        String objective,
        String assessment,
        String plan,
        boolean finalized,
        String aiDraftHash,
        String previewApprovedAt,
        String summaryEn,
        String summaryMs
    ) {}
}
