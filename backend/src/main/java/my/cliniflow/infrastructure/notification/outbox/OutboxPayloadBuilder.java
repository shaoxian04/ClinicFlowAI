package my.cliniflow.infrastructure.notification.outbox;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.notification.whatsapp.WhatsAppPayload;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Component
public class OutboxPayloadBuilder {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("d MMM yyyy");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("h:mm a");

    private final String portalBaseUrl;
    private final UserRepository users;

    public OutboxPayloadBuilder(
            @Value("${cliniflow.frontend.base-url:http://localhost:3000}") String portalBaseUrl,
            UserRepository users) {
        this.portalBaseUrl = portalBaseUrl;
        this.users = users;
    }

    public WhatsAppPayload build(NotificationOutboxEntity row, PatientModel patient) {
        String locale = (patient.getPreferredLanguage() == null || patient.getPreferredLanguage().isBlank())
            ? "en"
            : patient.getPreferredLanguage();

        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("patientName", safe(patient.getFullName(), "there"));

        if (row.getPayload() != null) {
            Object slotStart = row.getPayload().get("slotStartAt");
            if (slotStart != null) {
                OffsetDateTime t = parseOdt(slotStart.toString());
                if (t != null) {
                    vars.put("date", t.atZoneSameInstant(KL).format(DATE_FMT));
                    vars.put("time", t.atZoneSameInstant(KL).format(TIME_FMT));
                }
            }
            Object followUp = row.getPayload().get("followUpDate");
            if (followUp != null && !vars.containsKey("date")) {
                vars.put("date", followUp.toString());
                vars.put("time", "—");
            }
            Object doctorId = row.getPayload().get("doctorId");
            if (doctorId != null) {
                try {
                    users.findById(UUID.fromString(doctorId.toString()))
                         .map(UserModel::getFullName)
                         .ifPresent(name -> vars.put("doctorName", name));
                } catch (IllegalArgumentException ignored) { }
            }
            row.getPayload().forEach((k, v) -> {
                if (v != null && !vars.containsKey(k)) vars.put(k, v.toString());
            });
        }

        vars.putIfAbsent("doctorName", "your doctor");
        vars.putIfAbsent("date", "your scheduled date");
        vars.putIfAbsent("time", "the scheduled time");
        vars.putIfAbsent("medsSummary", "see portal for full list");
        vars.put("portalUrl", portalBaseUrl);

        return new WhatsAppPayload(
            patient.getPhone(),
            row.getTemplateId(),
            locale,
            vars);
    }

    private static OffsetDateTime parseOdt(String s) {
        try { return OffsetDateTime.parse(s); } catch (Exception e) { return null; }
    }

    private static String safe(String s, String fallback) {
        return (s == null || s.isBlank()) ? fallback : s;
    }
}
