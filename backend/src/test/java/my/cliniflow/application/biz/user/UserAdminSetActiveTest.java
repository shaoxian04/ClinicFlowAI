package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.ResultCode;
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

class UserAdminSetActiveTest {

    private static final UUID ACTOR  = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
    private static final UUID TARGET = UUID.fromString("00000000-0000-0000-0000-0000000000b1");

    private UserModel user(UUID id, boolean active) {
        UserModel u = new UserModel();
        u.setId(id);
        u.setRole(Role.STAFF);
        u.setActive(active);
        return u;
    }

    @Test
    void setActiveDeactivatesUserAndWritesAudit() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var u = user(TARGET, true);
        when(users.findById(TARGET)).thenReturn(Optional.of(u));
        var svc = new UserAdminAppService(users, audit);

        svc.setActive(ACTOR, TARGET, false);

        assertThat(u.isActive()).isFalse();
        verify(users).save(u);
        @SuppressWarnings({"rawtypes", "unchecked"})
        ArgumentCaptor<Map> meta = ArgumentCaptor.forClass(Map.class);
        verify(audit).append(
            eq("UPDATE"),
            eq("USER"),
            eq(TARGET.toString()),
            eq(ACTOR),
            eq("ADMIN"),
            meta.capture());
        assertThat((Map<String, Object>) meta.getValue())
            .containsEntry("active", false);
    }

    @Test
    void setActiveSelfActionForbiddenThrowsBusinessException() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        var svc = new UserAdminAppService(users, audit);

        assertThatThrownBy(() -> svc.setActive(ACTOR, ACTOR, false))
            .isInstanceOf(BusinessException.class)
            .satisfies(ex -> assertThat(((BusinessException) ex).resultCode())
                .isEqualTo(ResultCode.BAD_REQUEST));
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
        verify(users, never()).save(any());
    }

    @Test
    void setActiveMissingUserThrowsResourceNotFoundException() {
        var users = mock(UserRepository.class);
        var audit = mock(AuditWriter.class);
        when(users.findById(TARGET)).thenReturn(Optional.empty());
        var svc = new UserAdminAppService(users, audit);

        assertThatThrownBy(() -> svc.setActive(ACTOR, TARGET, false))
            .isInstanceOf(ResourceNotFoundException.class);
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
        verify(users, never()).save(any());
    }
}
