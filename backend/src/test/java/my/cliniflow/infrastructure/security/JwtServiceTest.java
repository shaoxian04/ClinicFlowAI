package my.cliniflow.infrastructure.security;

import my.cliniflow.domain.biz.user.enums.Role;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private final JwtService svc = new JwtService(
        "test-secret-key-that-is-at-least-32-chars-long!",
        60
    );

    @Test
    void issue_then_parse_roundtrip() {
        UUID uid = UUID.randomUUID();
        String token = svc.issue(uid, "x@y.z", Role.PATIENT);
        JwtService.Claims c = svc.parse(token);
        assertEquals(uid, c.userId());
        assertEquals("x@y.z", c.email());
        assertEquals(Role.PATIENT, c.role());
    }

    @Test
    void parse_rejects_garbage() {
        assertThrows(RuntimeException.class, () -> svc.parse("not-a-jwt"));
    }
}
