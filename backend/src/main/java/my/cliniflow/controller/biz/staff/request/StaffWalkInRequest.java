package my.cliniflow.controller.biz.staff.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Staff-led walk-in patient registration. Email and password are optional —
 * if email is provided, a PATIENT user account is created; otherwise only
 * the patient profile row is created (no login access).
 */
public record StaffWalkInRequest(
    @NotBlank @Size(max = 255) String fullName,
    LocalDate dateOfBirth,
    @Pattern(regexp = "MALE|FEMALE|OTHER", message = "gender must be MALE/FEMALE/OTHER")
    String gender,
    @Pattern(regexp = "^\\+?[0-9]{6,20}$", message = "phone must be 6-20 digits, optional leading +")
    String phone,
    @Email @Size(max = 254) String email,
    @Size(min = 8, max = 200) String password,
    @Pattern(regexp = "en|ms|zh") String preferredLanguage
) {}
