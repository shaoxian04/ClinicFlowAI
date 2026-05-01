package my.cliniflow.infrastructure.notification.scheduler;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import my.cliniflow.infrastructure.notification.outbox.NotificationOutboxEntity;
import my.cliniflow.infrastructure.notification.outbox.NotificationOutboxJpaRepository;
import my.cliniflow.infrastructure.notification.outbox.OutboxPayloadBuilder;
import my.cliniflow.infrastructure.notification.whatsapp.SendResult;
import my.cliniflow.infrastructure.notification.whatsapp.WhatsAppPayload;
import my.cliniflow.infrastructure.notification.whatsapp.WhatsAppSender;
import my.cliniflow.infrastructure.notification.whatsapp.log.WhatsAppMessageLogEntity;
import my.cliniflow.infrastructure.notification.whatsapp.log.WhatsAppMessageLogJpaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class OutboxDrainerSchedulerTest {

    NotificationOutboxJpaRepository outbox;
    WhatsAppMessageLogJpaRepository messageLog;
    WhatsAppSender sender;
    PatientRepository patients;
    OutboxPayloadBuilder payloadBuilder;
    AuditWriter audit;
    OutboxDrainerScheduler drainer;

    PatientModel patientWithConsent;

    @BeforeEach
    void setUp() {
        outbox = mock(NotificationOutboxJpaRepository.class);
        messageLog = mock(WhatsAppMessageLogJpaRepository.class);
        sender = mock(WhatsAppSender.class);
        patients = mock(PatientRepository.class);
        payloadBuilder = mock(OutboxPayloadBuilder.class);
        audit = mock(AuditWriter.class);
        drainer = new OutboxDrainerScheduler(outbox, messageLog, sender, patients,
            payloadBuilder, audit, 5, 5);

        patientWithConsent = new PatientModel();
        patientWithConsent.setFullName("Alice");
        patientWithConsent.setPhone("+60-12-000-0000");
        patientWithConsent.setWhatsappConsentAt(OffsetDateTime.parse("2026-04-30T10:00:00+08:00"));
    }

    private NotificationOutboxEntity duRow() {
        NotificationOutboxEntity r = new NotificationOutboxEntity();
        r.setTemplateId("appointment_confirmation_v1");
        r.setRecipientPatientId(UUID.randomUUID());
        r.setPayload(Map.of());
        r.setIdempotencyKey("k-" + UUID.randomUUID());
        r.setStatus("PENDING");
        r.setAttempts((short) 0);
        r.setNextAttemptAt(OffsetDateTime.now());
        return r;
    }

    @Test
    void sent_result_marks_row_SENT_and_writes_log_and_audit() {
        NotificationOutboxEntity row = duRow();
        when(outbox.findDueForSend(any(), any(Pageable.class))).thenReturn(List.of(row));
        when(patients.findById(row.getRecipientPatientId())).thenReturn(Optional.of(patientWithConsent));
        when(payloadBuilder.build(row, patientWithConsent)).thenReturn(
            new WhatsAppPayload("+60-12-000-0000", "appointment_confirmation_v1", "en", Map.of()));
        when(sender.send(any())).thenReturn(new SendResult.Sent("SM-test-123"));

        drainer.drain();

        assertThat(row.getStatus()).isEqualTo("SENT");
        assertThat(row.getSentAt()).isNotNull();
        verify(messageLog).save(any(WhatsAppMessageLogEntity.class));
        verify(audit).append(eq("UPDATE"), eq("NOTIFICATION_SEND"), any(), any(), eq("SYSTEM"));
    }

    @Test
    void retryable_result_increments_attempts_and_pushes_nextAttemptAt() {
        NotificationOutboxEntity row = duRow();
        row.setAttempts((short) 1);  // already had one attempt
        when(outbox.findDueForSend(any(), any(Pageable.class))).thenReturn(List.of(row));
        when(patients.findById(row.getRecipientPatientId())).thenReturn(Optional.of(patientWithConsent));
        when(payloadBuilder.build(row, patientWithConsent)).thenReturn(
            new WhatsAppPayload("+60-12-000-0000", "x", "en", Map.of()));
        OffsetDateTime before = OffsetDateTime.now();
        when(sender.send(any())).thenReturn(new SendResult.Retryable("twilio-busy"));

        drainer.drain();

        assertThat(row.getAttempts()).isEqualTo((short) 2);
        assertThat(row.getStatus()).isEqualTo("FAILED");
        assertThat(row.getLastError()).isEqualTo("twilio-busy");
        assertThat(row.getNextAttemptAt()).isAfterOrEqualTo(before.plusMinutes(3));  // 2^2=4, allow some slop
        verify(messageLog, never()).save(any());
    }

    @Test
    void terminal_result_marks_FAILED_with_max_attempts_no_retry() {
        NotificationOutboxEntity row = duRow();
        when(outbox.findDueForSend(any(), any(Pageable.class))).thenReturn(List.of(row));
        when(patients.findById(row.getRecipientPatientId())).thenReturn(Optional.of(patientWithConsent));
        when(payloadBuilder.build(row, patientWithConsent)).thenReturn(
            new WhatsAppPayload("+60-12-000-0000", "x", "en", Map.of()));
        when(sender.send(any())).thenReturn(new SendResult.Terminal("template-not-approved", "63016"));

        drainer.drain();

        assertThat(row.getStatus()).isEqualTo("FAILED");
        assertThat(row.getAttempts()).isEqualTo((short) 5);  // maxAttempts
        assertThat(row.getLastError()).startsWith("terminal:63016:");
    }

    @Test
    void no_consent_marks_row_SKIPPED_NO_CONSENT_and_does_not_call_sender() {
        NotificationOutboxEntity row = duRow();
        when(outbox.findDueForSend(any(), any(Pageable.class))).thenReturn(List.of(row));
        PatientModel noConsent = new PatientModel();
        noConsent.setPhone("+60-12-000-0000");
        // whatsappConsentAt is null — no consent
        when(patients.findById(row.getRecipientPatientId())).thenReturn(Optional.of(noConsent));

        drainer.drain();

        assertThat(row.getStatus()).isEqualTo("SKIPPED_NO_CONSENT");
        verify(sender, never()).send(any());
    }

    @Test
    void no_phone_marks_row_SKIPPED_NO_CONSENT() {
        NotificationOutboxEntity row = duRow();
        when(outbox.findDueForSend(any(), any(Pageable.class))).thenReturn(List.of(row));
        PatientModel noPhone = new PatientModel();
        noPhone.setWhatsappConsentAt(OffsetDateTime.now());
        // phone is null
        when(patients.findById(row.getRecipientPatientId())).thenReturn(Optional.of(noPhone));

        drainer.drain();

        assertThat(row.getStatus()).isEqualTo("SKIPPED_NO_CONSENT");
        verify(sender, never()).send(any());
    }

    @Test
    void reaper_runs_before_due_query() {
        when(outbox.findDueForSend(any(), any(Pageable.class))).thenReturn(List.of());
        when(outbox.reapStuckSending(any())).thenReturn(2);

        drainer.drain();

        verify(outbox).reapStuckSending(any());
        verify(outbox).findDueForSend(any(), any(Pageable.class));
    }
}
