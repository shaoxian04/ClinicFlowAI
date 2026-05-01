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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;

/**
 * Polls the {@code notification_outbox} table on a fixed delay, sends due
 * messages via {@link WhatsAppSender}, and updates row status with
 * exponential backoff on retryable failures.
 *
 * <p>Reaper pass: rows stuck in {@code SENDING} for longer than the
 * configured threshold are reverted to {@code FAILED} so the next tick
 * can retry them.
 *
 * <p>Default fixed delay: 30s (configurable via
 * {@code cliniflow.whatsapp.drainer-fixed-delay-ms}).
 */
@Component
public class OutboxDrainerScheduler {

    private static final Logger log = LoggerFactory.getLogger(OutboxDrainerScheduler.class);
    private static final int BATCH_SIZE = 25;
    private static final long MAX_BACKOFF_MIN = 30;

    private final NotificationOutboxJpaRepository outbox;
    private final WhatsAppMessageLogJpaRepository messageLog;
    private final WhatsAppSender sender;
    private final PatientRepository patients;
    private final OutboxPayloadBuilder payloadBuilder;
    private final AuditWriter audit;
    private final int maxAttempts;
    private final int stuckMinutes;

    public OutboxDrainerScheduler(
            NotificationOutboxJpaRepository outbox,
            WhatsAppMessageLogJpaRepository messageLog,
            WhatsAppSender sender,
            PatientRepository patients,
            OutboxPayloadBuilder payloadBuilder,
            AuditWriter audit,
            @Value("${cliniflow.whatsapp.max-attempts:5}") int maxAttempts,
            @Value("${cliniflow.whatsapp.reaper-stuck-after-minutes:5}") int stuckMinutes) {
        this.outbox = outbox;
        this.messageLog = messageLog;
        this.sender = sender;
        this.patients = patients;
        this.payloadBuilder = payloadBuilder;
        this.audit = audit;
        this.maxAttempts = maxAttempts;
        this.stuckMinutes = stuckMinutes;
    }

    @Scheduled(fixedDelayString = "${cliniflow.whatsapp.drainer-fixed-delay-ms:30000}")
    @Transactional
    public void drain() {
        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime stuckBefore = now.minusMinutes(stuckMinutes);
        int reaped = outbox.reapStuckSending(stuckBefore);
        if (reaped > 0) {
            log.info("[outbox-drainer] reaped {} stuck SENDING rows", reaped);
        }

        List<NotificationOutboxEntity> due = outbox.findDueForSend(now, PageRequest.of(0, BATCH_SIZE));
        if (due.isEmpty()) return;

        log.debug("[outbox-drainer] processing {} rows", due.size());
        for (NotificationOutboxEntity row : due) {
            try {
                processOne(row);
            } catch (RuntimeException ex) {
                log.error("[outbox-drainer] unexpected error processing row {}: {}",
                    row.getId(), ex.toString());
                row.setStatus("FAILED");
                row.setLastError("drainer-exception:" + ex.getClass().getSimpleName() + ":" + ex.getMessage());
                outbox.save(row);
            }
        }
    }

    private void processOne(NotificationOutboxEntity row) {
        row.setStatus("SENDING");
        outbox.save(row);

        PatientModel patient = patients.findById(row.getRecipientPatientId()).orElse(null);
        if (patient == null
            || patient.getWhatsappConsentAt() == null
            || patient.getPhone() == null || patient.getPhone().isBlank()) {
            row.setStatus("SKIPPED_NO_CONSENT");
            outbox.save(row);
            return;
        }

        WhatsAppPayload payload = payloadBuilder.build(row, patient);
        SendResult result = sender.send(payload);

        switch (result) {
            case SendResult.Sent s -> {
                row.setStatus("SENT");
                row.setSentAt(OffsetDateTime.now());
                outbox.save(row);
                logSendSuccess(row, payload, s);
                String rowId = row.getId() != null ? row.getId().toString() : "unknown";
                audit.append("UPDATE", "NOTIFICATION_SEND", rowId, null, "SYSTEM");
            }
            case SendResult.Retryable r -> {
                row.setAttempts((short) (row.getAttempts() + 1));
                row.setLastError(r.error());
                long backoffMins = Math.min(MAX_BACKOFF_MIN, (long) Math.pow(2, row.getAttempts()));
                row.setNextAttemptAt(OffsetDateTime.now().plusMinutes(backoffMins));
                row.setStatus("FAILED");
                outbox.save(row);
            }
            case SendResult.Terminal t -> {
                row.setStatus("FAILED");
                row.setAttempts((short) maxAttempts);
                row.setLastError("terminal:" + t.code() + ":" + t.error());
                outbox.save(row);
            }
        }
    }

    private void logSendSuccess(NotificationOutboxEntity row, WhatsAppPayload payload, SendResult.Sent s) {
        WhatsAppMessageLogEntity entry = new WhatsAppMessageLogEntity();
        entry.setOutboxId(row.getId());
        entry.setTwilioSid(s.twilioSid());
        entry.setToPhoneHash(sha256(payload.toPhoneE164()));
        entry.setTemplateId(payload.templateId());
        entry.setRenderedLocale(payload.locale());
        entry.setDeliveryStatus("QUEUED");  // Twilio's initial state; webhook updates later
        messageLog.save(entry);
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
