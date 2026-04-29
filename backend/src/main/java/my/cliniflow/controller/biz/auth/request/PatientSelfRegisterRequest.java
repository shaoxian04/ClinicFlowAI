package my.cliniflow.controller.biz.auth.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.Map;

public record PatientSelfRegisterRequest(
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8, max = 200) String password,
        @NotBlank @Size(max = 255) String fullName,
        LocalDate dateOfBirth,
        @Pattern(regexp = "MALE|FEMALE|OTHER", message = "gender must be MALE/FEMALE/OTHER")
        String gender,
        @Pattern(regexp = "^\\+?[0-9]{6,20}$", message = "phone must be 6-20 digits, optional leading +")
        String phone,
        @Pattern(regexp = "en|ms|zh") String preferredLanguage,
        String nationalId,
        @NotBlank String consentVersion,
        Map<String, Object> clinicalBaseline
) {}
