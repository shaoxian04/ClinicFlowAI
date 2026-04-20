package my.cliniflow.controller.biz.patient.response;

import java.time.OffsetDateTime;
import java.util.UUID;

public record PatientVisitSummaryResponse(
    UUID visitId,
    OffsetDateTime finalizedAt,
    String summaryEnPreview,
    int medicationCount
) {}
