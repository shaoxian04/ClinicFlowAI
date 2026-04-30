package my.cliniflow.controller.biz.auth.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForcedPasswordChangeRequest(
        @NotBlank String currentPassword,
        @NotBlank @Size(min = 12, max = 200) String newPassword
) {}
