package my.cliniflow.controller.biz.visit.response;

import java.time.OffsetDateTime;
import java.util.UUID;

public record FinalizeResponse(
    UUID visitId,
    String summaryEn,
    String summaryMs,
    OffsetDateTime finalizedAt
) {}
