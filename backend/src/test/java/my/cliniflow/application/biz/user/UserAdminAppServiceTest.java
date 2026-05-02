package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class UserAdminAppServiceTest {

    private static final UUID ACTOR  = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
    private static final UUID TARGET = UUID.fromString("00000000-0000-0000-0000-0000000000b1");

    private UserModel user(UUID id, Role role) {
        UserModel u = new UserModel();
        u.setId(id);
        u.setRole(role);
        return u;
    }

    @Test
    void changeRoleSelfActionForbidden() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var svc = new UserAdminAppServiceImpl(users, audit);

        assertThatThrownBy(() -> svc.changeRole(ACTOR, ACTOR, Role.ADMIN))
            .isInstanceOf(ConflictException.class)
            .hasMessageContaining("self");
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
    }

    @Test
    void changeRoleStaffToDoctorWritesAuditWithFromTo() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var u = user(TARGET, Role.STAFF);
        when(users.findById(TARGET)).thenReturn(Optional.of(u));
        var svc = new UserAdminAppServiceImpl(users, audit);

        svc.changeRole(ACTOR, TARGET, Role.DOCTOR);

        assertThat(u.getRole()).isEqualTo(Role.DOCTOR);
        verify(users).save(u);
        @SuppressWarnings({"rawtypes", "unchecked"})
        ArgumentCaptor<Map> meta = ArgumentCaptor.forClass(Map.class);
        verify(audit).append(
            eq("UPDATE"),
            eq("USER_ROLE"),
            eq(TARGET.toString()),
            eq(ACTOR),
            eq("ADMIN"),
            meta.capture());
        assertThat((Map<String, Object>) meta.getValue())
            .containsEntry("from", "STAFF")
            .containsEntry("to", "DOCTOR");
    }

    @Test
    void changeRoleNoOpWhenSameRole() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var u = user(TARGET, Role.STAFF);
        when(users.findById(TARGET)).thenReturn(Optional.of(u));
        var svc = new UserAdminAppServiceImpl(users, audit);

        svc.changeRole(ACTOR, TARGET, Role.STAFF);

        verify(users, never()).save(any());
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
    }

    @Test
    void changeRolePatientCurrentRoleRejected() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var u = user(TARGET, Role.PATIENT);
        when(users.findById(TARGET)).thenReturn(Optional.of(u));
        var svc = new UserAdminAppServiceImpl(users, audit);

        assertThatThrownBy(() -> svc.changeRole(ACTOR, TARGET, Role.STAFF))
            .isInstanceOf(ConflictException.class);
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
    }

    @Test
    void changeRoleToPatientRejected() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var u = user(TARGET, Role.STAFF);
        when(users.findById(TARGET)).thenReturn(Optional.of(u));
        var svc = new UserAdminAppServiceImpl(users, audit);

        assertThatThrownBy(() -> svc.changeRole(ACTOR, TARGET, Role.PATIENT))
            .isInstanceOf(ConflictException.class);
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
    }
}
