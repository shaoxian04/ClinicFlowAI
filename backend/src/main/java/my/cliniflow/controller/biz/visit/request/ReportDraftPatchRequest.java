package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportDraftPatchRequest(
    @NotBlank String path,   // dotted + indexed, e.g. "plan.medications[0].dose"
    Object value             // typed at runtime; backend writes as jsonb value
) {}
