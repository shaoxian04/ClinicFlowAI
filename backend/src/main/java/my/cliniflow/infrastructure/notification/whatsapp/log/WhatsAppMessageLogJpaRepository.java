package my.cliniflow.infrastructure.notification.whatsapp.log;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link WhatsAppMessageLogEntity}.
 */
public interface WhatsAppMessageLogJpaRepository
        extends JpaRepository<WhatsAppMessageLogEntity, UUID> {

    List<WhatsAppMessageLogEntity> findByOutboxId(UUID outboxId);
}
