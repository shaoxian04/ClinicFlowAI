package my.cliniflow.controller.biz.visit.response;

import java.time.OffsetDateTime;

public record ApproveResponse(boolean approved, OffsetDateTime approvedAt) {}
