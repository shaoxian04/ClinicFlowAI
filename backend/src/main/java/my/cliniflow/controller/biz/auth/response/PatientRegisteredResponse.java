package my.cliniflow.controller.biz.auth.response;

import my.cliniflow.domain.biz.user.enums.Role;

import java.util.UUID;

public record PatientRegisteredResponse(
        UUID userId,
        UUID patientId,
        String email,
        Role role,
        String token
) {}
