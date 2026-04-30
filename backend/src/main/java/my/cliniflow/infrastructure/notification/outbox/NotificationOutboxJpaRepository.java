package my.cliniflow.infrastructure.notification.outbox;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link NotificationOutboxEntity}.
 *
 * <p>Mirrors the Neo4jProjectionOutboxRepository style: explicit JPQL queries
 * for the drainer and the stuck-SENDING reaper.
 */
public interface NotificationOutboxJpaRepository
        extends JpaRepository<NotificationOutboxEntity, UUID> {

    Optional<NotificationOutboxEntity> findByIdempotencyKey(String key);

    @Query("""
        SELECT o FROM NotificationOutboxEntity o
         WHERE o.status IN ('PENDING','FAILED')
           AND o.nextAttemptAt <= :now
         ORDER BY o.nextAttemptAt
        """)
    List<NotificationOutboxEntity> findDueForSend(
            @Param("now") OffsetDateTime now,
            Pageable page);

    /**
     * Reverts rows that have been stuck in {@code SENDING} state since before
     * {@code stuckBefore} back to {@code FAILED} so the drainer can retry them.
     *
     * @param stuckBefore cutoff — rows last-modified before this instant are considered stuck
     * @return number of rows reverted
     */
    @Modifying(clearAutomatically = true)
    @Query("""
        UPDATE NotificationOutboxEntity o
           SET o.status = 'FAILED',
               o.lastError = 'reaper: stuck SENDING reverted'
         WHERE o.status = 'SENDING' AND o.gmtModified < :stuckBefore
        """)
    int reapStuckSending(@Param("stuckBefore") OffsetDateTime stuckBefore);
}
