package my.cliniflow.controller.biz.staff.request;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Request body for {@code POST /api/staff/checkin}. The actor (acting staff
 * user) is derived server-side from the JWT principal — never trust a userId
 * supplied in the request body.
 */
public record CheckinRequest(@NotNull UUID appointmentId) {}
