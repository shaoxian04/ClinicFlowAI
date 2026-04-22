package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record ReportClarifySyncRequest(@NotBlank String answer) {}
