package my.cliniflow.infrastructure.outbox;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

public interface Neo4jProjectionOutboxRepository
        extends JpaRepository<Neo4jProjectionOutboxEntity, Long> {

    @Query("""
            SELECT o FROM Neo4jProjectionOutboxEntity o
             WHERE o.status IN ('PENDING','FAILED')
               AND o.nextAttemptAt <= :now
             ORDER BY o.nextAttemptAt ASC
            """)
    List<Neo4jProjectionOutboxEntity> findDrainable(
            @Param("now") OffsetDateTime now,
            Pageable pageable);

    default List<Neo4jProjectionOutboxEntity> findDrainable(OffsetDateTime now, int limit) {
        return findDrainable(now, PageRequest.of(0, limit));
    }
}
