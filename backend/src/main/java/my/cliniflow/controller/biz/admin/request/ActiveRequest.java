package my.cliniflow.controller.biz.admin.request;

/**
 * Request body for {@code PATCH /api/admin/users/{id}/active}. The {@code active}
 * flag is applied directly to {@link my.cliniflow.domain.biz.user.model.UserModel}.
 */
public record ActiveRequest(boolean active) {}
