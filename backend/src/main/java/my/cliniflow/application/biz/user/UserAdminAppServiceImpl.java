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

@Service
public class UserAdminAppServiceImpl implements UserAdminAppService {

    private static final EnumSet<Role> STAFF_ROLES =
        EnumSet.of(Role.STAFF, Role.DOCTOR, Role.ADMIN);

    private final UserRepository users;
    private final AuditWriter audit;

    public UserAdminAppServiceImpl(UserRepository users, AuditWriter audit) {
        this.users = users;
        this.audit = audit;
    }

    @Override
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

    @Override
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

    @Override
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
