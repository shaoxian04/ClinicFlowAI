package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

import java.util.List;

public record PostVisitGenerateRequest(
    @Valid
    @Size(max = 3, message = "at most 3 medications")
    List<MedicationInput> medications
) {}
