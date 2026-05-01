package my.cliniflow.domain.biz.visit.info;

import java.util.UUID;

public record AcknowledgeFindingInfo(UUID findingId, UUID doctorId, String reason) {}
