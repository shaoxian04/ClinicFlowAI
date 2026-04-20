package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotNull;

public record SoapDraftRequest(
    @NotNull String subjective,
    @NotNull String objective,
    @NotNull String assessment,
    @NotNull String plan
) {}
