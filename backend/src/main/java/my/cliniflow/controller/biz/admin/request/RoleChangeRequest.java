package my.cliniflow.controller.biz.admin.request;

import jakarta.validation.constraints.NotBlank;

/**
 * Request body for {@code PATCH /api/admin/users/{id}/role}. The role string
 * is validated against {@link my.cliniflow.domain.biz.user.enums.Role} in the
 * controller; invalid values produce a 400.
 */
public record RoleChangeRequest(@NotBlank String role) {}
