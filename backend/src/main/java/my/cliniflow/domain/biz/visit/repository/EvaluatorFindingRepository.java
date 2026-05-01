package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EvaluatorFindingRepository extends JpaRepository<EvaluatorFindingModel, UUID> {

    @Query("SELECT f FROM EvaluatorFindingModel f " +
           "WHERE f.visitId = :visitId AND f.supersededAt IS NULL " +
           "ORDER BY " +
           "  CASE f.severity " +
           "    WHEN my.cliniflow.domain.biz.visit.enums.FindingSeverity.CRITICAL THEN 0 " +
           "    WHEN my.cliniflow.domain.biz.visit.enums.FindingSeverity.HIGH THEN 1 " +
           "    WHEN my.cliniflow.domain.biz.visit.enums.FindingSeverity.MEDIUM THEN 2 " +
           "    ELSE 3 END, " +
           "  f.gmtCreate")
    List<EvaluatorFindingModel> findActiveByVisitId(@Param("visitId") UUID visitId);

    @Query("SELECT COUNT(f) FROM EvaluatorFindingModel f " +
           "WHERE f.visitId = :visitId " +
           "  AND f.severity = my.cliniflow.domain.biz.visit.enums.FindingSeverity.CRITICAL " +
           "  AND f.acknowledgedAt IS NULL AND f.supersededAt IS NULL")
    long countUnacknowledgedCritical(@Param("visitId") UUID visitId);
}
