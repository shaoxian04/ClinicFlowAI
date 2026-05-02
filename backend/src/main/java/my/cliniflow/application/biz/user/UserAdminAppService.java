package my.cliniflow.application.biz.user;

import my.cliniflow.domain.biz.user.enums.Role;

import java.util.UUID;

/**
 * Write-side application service for admin user-management actions
 * (role change, active flip, force password reset).
 *
 * <p>All methods enforce a self-action guard: an admin may not act on their
 * own user id. Violations throw {@link my.cliniflow.controller.base.ConflictException}
 * surfacing 409.
 *
 * <p>Role changes are restricted to staff-only roles
 * ({@code STAFF, DOCTOR, ADMIN}). Patient role transitions in or out are
 * out of scope and return 409.
 */
public interface UserAdminAppService {

    /**
     * Activates or deactivates the target user account. An admin may not
     * change their own account status (self-action guard → 409).
     */
    void setActive(UUID actorUserId, UUID targetUserId, boolean active);

    /**
     * Forces the target user to change their password on next login. Cannot
     * be applied to yourself (self-action guard → 409).
     */
    void forcePasswordReset(UUID actorUserId, UUID targetUserId);

    /**
     * Updates the target user's role. Rejects self-action and patient-role
     * transitions. Idempotent on no-op (target already has the requested role).
     */
    void changeRole(UUID actorUserId, UUID targetUserId, Role newRole);
}
