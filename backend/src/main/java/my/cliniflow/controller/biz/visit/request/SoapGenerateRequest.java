package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotNull;

public record SoapGenerateRequest(@NotNull String transcript) {}
