package my.cliniflow.infrastructure.notification.outbox;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.notification.whatsapp.WhatsAppPayload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OutboxPayloadBuilderTest {

    OutboxPayloadBuilder builder;
    UserRepository users;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        when(users.findById(org.mockito.ArgumentMatchers.any())).thenReturn(java.util.Optional.empty());
        builder = new OutboxPayloadBuilder("https://app.cliniflow.local", users);
    }

    @Test
    void includes_patient_name_and_phone_and_portal_url() {
        PatientModel p = new PatientModel();
        p.setFullName("Alice Tan");
        p.setPhone("+60-12-345-6789");
        p.setPreferredLanguage("en");

        NotificationOutboxEntity row = new NotificationOutboxEntity();
        row.setTemplateId("appointment_confirmation_v1");
        row.setPayload(Map.of("appointmentId", UUID.randomUUID().toString()));

        WhatsAppPayload out = builder.build(row, p);
        assertThat(out.toPhoneE164()).isEqualTo("+60-12-345-6789");
        assertThat(out.templateId()).isEqualTo("appointment_confirmation_v1");
        assertThat(out.locale()).isEqualTo("en");
        assertThat(out.vars()).containsEntry("patientName", "Alice Tan");
        assertThat(out.vars()).containsEntry("portalUrl", "https://app.cliniflow.local");
        assertThat(out.vars()).containsKey("appointmentId");
    }

    @Test
    void falls_back_to_en_when_preferredLanguage_missing() {
        PatientModel p = new PatientModel();
        p.setFullName("Bob");
        p.setPhone("+60-12-345-0000");
        // preferredLanguage left null

        NotificationOutboxEntity row = new NotificationOutboxEntity();
        row.setTemplateId("appointment_confirmation_v1");
        row.setPayload(Map.of());

        WhatsAppPayload out = builder.build(row, p);
        assertThat(out.locale()).isEqualTo("en");
    }

    @Test
    void uses_patient_preferredLanguage_when_set() {
        PatientModel p = new PatientModel();
        p.setFullName("Aishah");
        p.setPhone("+60-12-555-1234");
        p.setPreferredLanguage("ms");

        NotificationOutboxEntity row = new NotificationOutboxEntity();
        row.setTemplateId("appointment_confirmation_v1");
        row.setPayload(Map.of());

        WhatsAppPayload out = builder.build(row, p);
        assertThat(out.locale()).isEqualTo("ms");
    }

    @Test
    void falls_back_to_there_when_fullName_blank() {
        PatientModel p = new PatientModel();
        p.setFullName("");
        p.setPhone("+60-12-000-0000");

        NotificationOutboxEntity row = new NotificationOutboxEntity();
        row.setTemplateId("appointment_confirmation_v1");
        row.setPayload(Map.of());

        WhatsAppPayload out = builder.build(row, p);
        assertThat(out.vars()).containsEntry("patientName", "there");
    }
}
