package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MedicalReportRepository extends JpaRepository<MedicalReportModel, UUID> {
    Optional<MedicalReportModel> findByVisitId(UUID visitId);

    /**
     * Finalized medical reports for a given patient, joined to visits.
     * Ordered by finalized_at descending. The repository operates on
     * MedicalReportModel only — the visit join is via the matching visit_id.
     */
    @Query(
        "SELECT r FROM MedicalReportModel r, my.cliniflow.domain.biz.visit.model.VisitModel v "
        + "WHERE r.visitId = v.id AND v.patientId = :pid "
        + "AND r.finalizedAt IS NOT NULL "
        + "ORDER BY r.finalizedAt DESC")
    List<MedicalReportModel> findFinalizedByPatientId(@Param("pid") UUID patientId, Pageable page);
}
