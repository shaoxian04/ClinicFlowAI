package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link PreVisitReportModel}.
 *
 * <p>{@code pre_visit_reports.visit_id} is the {@code UNIQUE} key linking
 * each report to its parent visit. The repository exposes targeted lookups
 * used by read paths that need to know whether a pre-visit report exists
 * for a set of visits (e.g. the staff "today" waiting list).
 */
public interface PreVisitReportRepository extends JpaRepository<PreVisitReportModel, UUID> {

    /**
     * Returns the visit ids (subset of {@code visitIds}) that already have an
     * associated {@link PreVisitReportModel}. Empty input → empty output.
     */
    @Query("SELECT r.visit.id FROM PreVisitReportModel r WHERE r.visit.id IN :visitIds")
    List<UUID> findVisitIdsIn(@Param("visitIds") Collection<UUID> visitIds);
}
