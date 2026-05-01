package my.cliniflow.infrastructure.notification.outbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Round-trip integration test for {@link NotificationOutboxEntity}.
 *
 * <p>Uses seeded patient row: {@code 00000000-0000-0000-0000-000000000010}.
 *
 * <p><strong>Partial unique index caveat:</strong> Production Postgres enforces
 * {@code idx_outbox_drainer} as a partial index
 * ({@code WHERE status IN ('PENDING','FAILED')}).  H2 does not support predicate
 * partial indexes; the regular {@code UNIQUE (idempotency_key)} index IS present
 * and tested here.
 */
@SpringBootTest
@Transactional
class NotificationOutboxEntityIT {

    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    static final OffsetDateTime BASE =
        OffsetDateTime.of(2026, 5, 10, 9, 0, 0, 0, ZoneOffset.UTC);

    @Autowired
    NotificationOutboxJpaRepository outboxRepo;

    // -----------------------------------------------------------------------
    // Test 1: basic round-trip
    // -----------------------------------------------------------------------

    @Test
    void save_and_findById_roundTrip() {
        NotificationOutboxEntity entity = buildOutbox(
            "APPOINTMENT_BOOKED:test-1",
            Map.of("appointmentId", "uuid"),
            BASE
        );
        NotificationOutboxEntity saved = outboxRepo.saveAndFlush(entity);

        assertThat(saved.getId()).isNotNull();

        NotificationOutboxEntity loaded = outboxRepo.findById(saved.getId()).orElseThrow();
        assertThat(loaded.getEventType()).isEqualTo("APPOINTMENT_BOOKED");
        assertThat(loaded.getChannel()).isEqualTo("WHATSAPP");
        assertThat(loaded.getTemplateId()).isEqualTo("appt_booked_v1");
        assertThat(loaded.getRecipientPatientId()).isEqualTo(PATIENT_ID);
        assertThat(loaded.getIdempotencyKey()).isEqualTo("APPOINTMENT_BOOKED:test-1");
        assertThat(loaded.getStatus()).isEqualTo("PENDING");
        assertThat(loaded.getAttempts()).isEqualTo((short) 0);
        assertThat(loaded.getNextAttemptAt()).isNotNull();

        // Payload deserialises and the key is present
        Map<String, Object> payload = loaded.getPayload();
        assertThat(payload).containsKey("appointmentId");
        assertThat(payload.get("appointmentId")).isEqualTo("uuid");
    }

    @Test
    void findByIdempotencyKey_returnsRow() {
        outboxRepo.saveAndFlush(buildOutbox("APPOINTMENT_BOOKED:idem-1",
            Map.of("appointmentId", "idem-uuid"), BASE));

        Optional<NotificationOutboxEntity> found =
            outboxRepo.findByIdempotencyKey("APPOINTMENT_BOOKED:idem-1");
        assertThat(found).isPresent();
        assertThat(found.get().getIdempotencyKey()).isEqualTo("APPOINTMENT_BOOKED:idem-1");
    }

    // -----------------------------------------------------------------------
    // Test 2: UNIQUE constraint on idempotency_key
    // -----------------------------------------------------------------------

    @Test
    void idempotencyKey_uniqueConstraint_throwsOnDuplicate() {
        outboxRepo.saveAndFlush(buildOutbox("APPOINTMENT_BOOKED:dup-1",
            Map.of("appointmentId", "uuid-dup"), BASE));

        assertThatThrownBy(() ->
            outboxRepo.saveAndFlush(buildOutbox("APPOINTMENT_BOOKED:dup-1",
                Map.of("appointmentId", "uuid-dup-2"), BASE.plusMinutes(1)))
        ).isInstanceOf(DataIntegrityViolationException.class);
    }

    // -----------------------------------------------------------------------
    // Test 3: findDueForSend — ordered by nextAttemptAt ascending
    // -----------------------------------------------------------------------

    @Test
    void findDueForSend_returnsOrderedByNextAttemptAt() {
        // Insert 3 rows with different nextAttemptAt values, all in the past
        OffsetDateTime t1 = BASE.minusMinutes(30);
        OffsetDateTime t2 = BASE.minusMinutes(60);
        OffsetDateTime t3 = BASE.minusMinutes(10);

        NotificationOutboxEntity e1 = buildOutbox("APPOINTMENT_BOOKED:ord-1", Map.of("n", 1), t1);
        NotificationOutboxEntity e2 = buildOutbox("APPOINTMENT_BOOKED:ord-2", Map.of("n", 2), t2);
        NotificationOutboxEntity e3 = buildOutbox("APPOINTMENT_BOOKED:ord-3", Map.of("n", 3), t3);
        outboxRepo.saveAndFlush(e1);
        outboxRepo.saveAndFlush(e2);
        outboxRepo.saveAndFlush(e3);

        List<NotificationOutboxEntity> due =
            outboxRepo.findDueForSend(BASE, PageRequest.of(0, 10));

        // Only our 3 rows (all with nextAttemptAt <= BASE); ordering: t2 < t1 < t3
        assertThat(due).hasSizeGreaterThanOrEqualTo(3);
        // Extract idempotency keys in the order returned
        List<String> keys = due.stream()
            .map(NotificationOutboxEntity::getIdempotencyKey)
            .filter(k -> k.startsWith("APPOINTMENT_BOOKED:ord-"))
            .toList();

        assertThat(keys).containsExactly(
            "APPOINTMENT_BOOKED:ord-2",  // t2 = -60m (earliest)
            "APPOINTMENT_BOOKED:ord-1",  // t1 = -30m
            "APPOINTMENT_BOOKED:ord-3"   // t3 = -10m (latest)
        );
    }

    // -----------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------

    private NotificationOutboxEntity buildOutbox(String idempotencyKey,
                                                  Map<String, Object> payload,
                                                  OffsetDateTime nextAttemptAt) {
        NotificationOutboxEntity e = new NotificationOutboxEntity();
        e.setEventType("APPOINTMENT_BOOKED");
        e.setChannel("WHATSAPP");
        e.setTemplateId("appt_booked_v1");
        e.setRecipientPatientId(PATIENT_ID);
        e.setPayload(payload);
        e.setIdempotencyKey(idempotencyKey);
        e.setStatus("PENDING");
        e.setAttempts((short) 0);
        e.setNextAttemptAt(nextAttemptAt);
        return e;
    }
}
