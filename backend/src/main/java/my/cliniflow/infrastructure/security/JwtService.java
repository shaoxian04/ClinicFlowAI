package my.cliniflow.infrastructure.security;

import my.cliniflow.domain.biz.user.enums.Role;

import java.util.UUID;

public interface JwtService {

    String issue(UUID userId, String email, Role role);

    Claims parse(String token);

    record Claims(UUID userId, String email, Role role) {}
}
