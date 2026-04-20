package my.cliniflow.controller.biz.previsit.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PreVisitTurnRequest(
    @NotBlank @Size(max = 2000) String userMessage
) {}
