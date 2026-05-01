package my.cliniflow.controller.biz.patient.request;

import jakarta.validation.constraints.NotNull;

public record WhatsAppConsentUpdateRequest(@NotNull Boolean consent) {}
