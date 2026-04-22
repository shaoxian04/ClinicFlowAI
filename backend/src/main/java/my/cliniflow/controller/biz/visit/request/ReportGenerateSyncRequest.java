package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportGenerateSyncRequest(
    @NotBlank String transcript,
    String specialty  // nullable
) {}
