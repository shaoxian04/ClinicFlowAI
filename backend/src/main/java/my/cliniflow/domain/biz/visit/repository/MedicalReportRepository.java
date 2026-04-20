package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface MedicalReportRepository extends JpaRepository<MedicalReportModel, UUID> {
    Optional<MedicalReportModel> findByVisitId(UUID visitId);
}
