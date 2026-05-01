package my.cliniflow.controller.biz.patient.response;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Minimal "me" view of the patient profile — used by the portal's profile page
 * and the WhatsApp opt-in modal to probe current state. PHI-light: no clinical
 * fields surface here.
 */
public record PatientMeResponse(
    UUID patientId,
    String fullName,
    String phone,
    String preferredLanguage,
    boolean whatsappConsent,
    OffsetDateTime whatsappConsentAt,
    String whatsappConsentVersion
) {}
