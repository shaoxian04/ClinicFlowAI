package my.cliniflow.controller.biz.auth.response;

import my.cliniflow.domain.biz.user.enums.Role;

import java.util.UUID;

public record LoginResponse(
    String token,
    UUID userId,
    String email,
    Role role,
    String fullName,
    boolean devSeedAllowed,
    boolean mustChangePassword
) {}
