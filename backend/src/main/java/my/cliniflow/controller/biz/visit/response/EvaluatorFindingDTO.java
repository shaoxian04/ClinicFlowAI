package my.cliniflow.controller.biz.visit.response;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record EvaluatorFindingDTO(
    UUID id, UUID visitId,
    String category, String severity,
    String fieldPath, String message,
    Map<String, Object> details,
    OffsetDateTime acknowledgedAt, UUID acknowledgedBy, String acknowledgementReason,
    OffsetDateTime gmtCreate
) {}
