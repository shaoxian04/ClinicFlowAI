package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportGenerateRequest(
    @NotBlank String transcript,
    String specialty
) {}
