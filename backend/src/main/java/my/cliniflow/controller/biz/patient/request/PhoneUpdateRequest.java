package my.cliniflow.controller.biz.patient.request;

import jakarta.validation.constraints.Pattern;

/**
 * Phone update payload. Allows {@code null} via the body to clear (e.g.
 * {@code {"phone": null}}), but if a non-null value is supplied it must
 * match E.164 with a leading +.
 *
 * <p>The regex permits an empty string OR a valid E.164 number. App service
 * normalises blank/empty/null to {@code null} before calling the domain method.
 */
public record PhoneUpdateRequest(
    @Pattern(regexp = "^(\\+\\d{8,15})?$", message = "phone must be E.164 format (or null to clear)")
    String phone) {}
