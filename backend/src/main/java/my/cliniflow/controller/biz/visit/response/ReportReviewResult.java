package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;

public record ReportReviewResult(
    String status,   // "complete" | "clarification_pending"
    MedicalReportDto report,
    Clarification clarification
) {
    public record Clarification(String field, String prompt, String context) {}
}
