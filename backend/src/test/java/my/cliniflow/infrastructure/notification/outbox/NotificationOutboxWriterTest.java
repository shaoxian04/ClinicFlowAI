package my.cliniflow.infrastructure.notification.outbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for {@link NotificationOutboxWriter}.
 *
 * <p>Uses seeded patient row: {@code 00000000-0000-0000-0000-000000000010}.
 */
@SpringBootTest
@Transactional
class NotificationOutboxWriterTest {

    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired
    NotificationOutboxWriter writer;

    @Autowired
    NotificationOutboxJpaRepository repo;

    @Test
    void enqueue_inserts_row_with_pending_status() {
        Optional<UUID> id = writer.enqueueWhatsApp(
            NotificationEventType.APPOINTMENT_BOOKED,
            "appointment_confirmation_v1",
            PATIENT_ID,
            Map.of("appointmentId", UUID.randomUUID().toString()),
            "APPOINTMENT_BOOKED:" + UUID.randomUUID());

        assertThat(id).isPresent();
        NotificationOutboxEntity row = repo.findById(id.get()).orElseThrow();
        assertThat(row.getStatus()).isEqualTo("PENDING");
        assertThat(row.getAttempts()).isEqualTo((short) 0);
        assertThat(row.getChannel()).isEqualTo("WHATSAPP");
        assertThat(row.getTemplateId()).isEqualTo("appointment_confirmation_v1");
    }

    @Test
    void enqueue_returns_empty_on_duplicate_idempotency_key() {
        String key = "APPOINTMENT_BOOKED:" + UUID.randomUUID();
        long before = repo.count();
        writer.enqueueWhatsApp(NotificationEventType.APPOINTMENT_BOOKED,
            "appointment_confirmation_v1", PATIENT_ID,
            Map.of("k", "v"), key);
        Optional<UUID> second = writer.enqueueWhatsApp(NotificationEventType.APPOINTMENT_BOOKED,
            "appointment_confirmation_v1", PATIENT_ID,
            Map.of("k", "v2"), key);
        long after = repo.count();
        assertThat(second).isEmpty();
        assertThat(after - before).isEqualTo(1);
    }
}
