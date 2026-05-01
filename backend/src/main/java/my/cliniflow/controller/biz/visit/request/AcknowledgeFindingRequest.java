package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.Size;

public record AcknowledgeFindingRequest(@Size(max = 255) String reason) {}
