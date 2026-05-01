package my.cliniflow.domain.biz.visit.event;

import java.time.OffsetDateTime;
import java.util.UUID;

public record EvaluatorFindingAcknowledgedDomainEvent(
    UUID visitId, UUID findingId, UUID doctorId, String reason, OffsetDateTime occurredAt
) {}
