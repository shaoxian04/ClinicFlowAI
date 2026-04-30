package my.cliniflow.controller.biz.admin.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank @Pattern(regexp = "STAFF|DOCTOR|ADMIN") String role,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 12, max = 200) String tempPassword,
        @NotBlank @Size(max = 255) String fullName,
        @Pattern(regexp = "^\\+?[0-9]{6,20}$") String phone,
        String employeeId,
        String mmcNumber,
        String specialty,
        String signatureImageUrl
) {}
