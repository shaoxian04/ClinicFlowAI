package my.cliniflow.infrastructure.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * Single source of clinic letterhead info for both PDF generators and
 * the Doctor Report Preview UI. Bound from `cliniflow.clinic.*` in
 * application.yml. App fails to start if any field is blank.
 */
@Validated
@ConfigurationProperties(prefix = "cliniflow.clinic")
public record ClinicProperties(
        @NotBlank String name,
        @NotBlank String addressLine1,
        @NotBlank String addressLine2,
        @NotBlank String phone,
        @NotBlank String email,
        @NotBlank String registrationNumber
) {}
