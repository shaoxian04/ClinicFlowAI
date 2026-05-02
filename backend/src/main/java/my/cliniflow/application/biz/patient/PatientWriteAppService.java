package my.cliniflow.application.biz.patient;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public interface PatientWriteAppService {

    void recordConsent(UUID userId, OffsetDateTime timestamp);

    /**
     * Register a new patient (self-service or staff-led).
     * Returns the patient row id. NRIC is encrypted + fingerprinted; duplicate
     * fingerprint throws ConflictException.
     */
    RegistrationResult register(RegistrationInput in,
                                UUID actorUserId,
                                String actorRole);

    void updateClinicalProfile(UUID patientId,
                               Map<String, Object> patch,
                               String source,
                               UUID actorUserId,
                               String actorRole);

    void updateWhatsAppConsent(UUID userId, boolean consent);

    void updatePhone(UUID userId, String phone);

    /** Input for registration. Built by controller from request DTO. */
    record RegistrationInput(
        String fullName,
        LocalDate dateOfBirth,
        String gender,
        String phone,
        String email,
        String preferredLanguage,
        String nationalId,
        String registrationSource,
        String consentVersion,
        boolean createUserAccount,
        String password,
        Map<String, Object> clinicalBaseline
    ) {}

    record RegistrationResult(UUID patientId, UUID userId) {}
}
