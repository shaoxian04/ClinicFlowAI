package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

public record VisitSummaryResponse(
    UUID visitId,
    UUID patientId,
    String patientName,
    VisitStatus status,
    boolean preVisitDone,
    boolean soapFinalized,
    OffsetDateTime createdAt
) {}
