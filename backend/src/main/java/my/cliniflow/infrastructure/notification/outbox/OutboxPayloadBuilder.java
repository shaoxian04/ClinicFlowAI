package my.cliniflow.infrastructure.notification.outbox;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.infrastructure.notification.whatsapp.WhatsAppPayload;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Translates an outbox row + patient into a {@link WhatsAppPayload} for the
 * sender. MVP scope: passes through the row's payload map as the var source
 * and uses the patient's preferred locale (defaulting to "en").
 *
 * <p>Future enhancement: per-template helpers that look up doctor name, slot
 * times, portal URL etc. and render PHI-safe variables only. The current
 * implementation surfaces only the fields already present in the outbox
 * payload — callers (listeners) are responsible for putting only PHI-safe
 * data there.
 */
@Component
public class OutboxPayloadBuilder {

    private final String portalBaseUrl;

    public OutboxPayloadBuilder(@Value("${cliniflow.frontend.base-url:http://localhost:3000}") String portalBaseUrl) {
        this.portalBaseUrl = portalBaseUrl;
    }

    public WhatsAppPayload build(NotificationOutboxEntity row, PatientModel patient) {
        String locale = (patient.getPreferredLanguage() == null || patient.getPreferredLanguage().isBlank())
            ? "en"
            : patient.getPreferredLanguage();

        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("patientName", safe(patient.getFullName(), "there"));
        // Pass through any string-coercible fields from the outbox payload — listeners
        // are responsible for putting only PHI-safe data here (no symptoms, no diagnoses).
        if (row.getPayload() != null) {
            row.getPayload().forEach((k, v) -> {
                if (v != null) vars.put(k, v.toString());
            });
        }
        vars.put("portalUrl", portalBaseUrl);

        return new WhatsAppPayload(
            patient.getPhone(),
            row.getTemplateId(),
            locale,
            vars);
    }

    private static String safe(String s, String fallback) {
        return (s == null || s.isBlank()) ? fallback : s;
    }
}
