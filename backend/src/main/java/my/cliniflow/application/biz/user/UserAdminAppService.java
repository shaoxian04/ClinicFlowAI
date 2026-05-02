package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;

/**
 * Write-side application service for admin user-management actions
 * (role change, active flip, force password reset).
 *
 * <p>All methods enforce a self-action guard: an admin may not act on their
 * own user id. Violations throw {@link ConflictException} surfacing 409.
 *
 * <p>Role changes are restricted to staff-only roles
 * ({@code STAFF, DOCTOR, ADMIN}). Patient role transitions in or out are
 * out of scope and return 409.
 */
@Service
public class UserAdminAppService {

    private static final EnumSet<Role> STAFF_ROLES =
        EnumSet.of(Role.STAFF, Role.DOCTOR, Role.ADMIN);

    private final UserRepository users;
    private final AuditWriter audit;

    public UserAdminAppService(UserRepository users, AuditWriter audit) {
        this.users = users;
        this.audit = audit;
    }

    /**
     * Activates or deactivates the target user account. An admin may not
     * change their own account status (self-action guard → 409).
     */
    @Transactional
    public void setActive(UUID actorUserId, UUID targetUserId, boolean active) {
        if (actorUserId.equals(targetUserId)) {
            throw new ConflictException("cannot change active status of your own account (self-action forbidden)");
        }
        UserModel u = users.findById(targetUserId).orElseThrow(
            () -> new ResourceNotFoundException("USER", targetUserId));
        u.setActive(active);
        users.save(u);
        audit.append(
            "UPDATE",
            "USER",
            targetUserId.toString(),
            actorUserId,
            "ADMIN",
            Map.of("active", active));
    }

    /**
     * Forces the target user to change their password on next login. Cannot
     * be applied to yourself (self-action guard → 409).
     */
    @Transactional
    public void forcePasswordReset(UUID actorUserId, UUID targetUserId) {
        if (actorUserId.equals(targetUserId)) {
            throw new ConflictException("cannot force password reset on your own account (self-action forbidden)");
        }
        UserModel u = users.findById(targetUserId).orElseThrow(
            () -> new ResourceNotFoundException("USER", targetUserId));
        u.setMustChangePassword(true);
        users.save(u);
        audit.append(
            "UPDATE",
            "USER",
            targetUserId.toString(),
            actorUserId,
            "ADMIN",
            Map.of("must_change_password", true));
    }

    /**
     * Updates the target user's role. Rejects self-action and patient-role
     * transitions. Idempotent on no-op (target already has the requested role).
     */
    @Transactional
    public void changeRole(UUID actorUserId, UUID targetUserId, Role newRole) {
        if (actorUserId.equals(targetUserId)) {
            throw new ConflictException("cannot change your own role (self-action forbidden)");
        }
        UserModel u = users.findById(targetUserId).orElseThrow(
            () -> new ResourceNotFoundException("USER", targetUserId));
        if (!STAFF_ROLES.contains(u.getRole()) || !STAFF_ROLES.contains(newRole)) {
            throw new ConflictException("role change limited to STAFF/DOCTOR/ADMIN");
        }
        if (u.getRole() == newRole) {
            return;
        }
        Role from = u.getRole();
        u.setRole(newRole);
        users.save(u);
        audit.append(
            "UPDATE",
            "USER_ROLE",
            targetUserId.toString(),
            actorUserId,
            "ADMIN",
            Map.of("from", from.name(), "to", newRole.name()));
    }
}
