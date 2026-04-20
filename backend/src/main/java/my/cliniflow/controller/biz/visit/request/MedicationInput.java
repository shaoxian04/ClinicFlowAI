package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record MedicationInput(
    @NotBlank String name,
    @NotBlank String dosage,
    @NotBlank String frequency
) {}
