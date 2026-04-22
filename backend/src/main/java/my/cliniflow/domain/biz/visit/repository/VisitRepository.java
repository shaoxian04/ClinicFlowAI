package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface VisitRepository extends JpaRepository<VisitModel, UUID> {
    List<VisitModel> findByDoctorIdAndStatusOrderByGmtCreateDesc(UUID doctorId, VisitStatus status);
    List<VisitModel> findByDoctorIdOrderByGmtCreateDesc(UUID doctorId);
    List<VisitModel> findByPatientIdAndStatusOrderByFinalizedAtDesc(UUID patientId, VisitStatus status);

    @Query(
        value = "SELECT report_draft::text FROM visits WHERE id = :visitId",
        nativeQuery = true
    )
    String findReportDraftJson(@Param("visitId") UUID visitId);

    @Transactional
    @Modifying
    @Query(
        value = "UPDATE visits SET report_draft = jsonb_set(COALESCE(report_draft, '{}'::jsonb), CAST(:path AS text[]), CAST(:valueJson AS jsonb), true) WHERE id = :visitId",
        nativeQuery = true
    )
    void patchReportDraftJsonb(
        @Param("visitId") UUID visitId,
        @Param("path") String path,
        @Param("valueJson") String valueJson
    );
}
