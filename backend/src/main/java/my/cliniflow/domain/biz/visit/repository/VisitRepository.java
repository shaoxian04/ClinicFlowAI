package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface VisitRepository extends JpaRepository<VisitModel, UUID> {
    List<VisitModel> findByDoctorIdAndStatusOrderByGmtCreateDesc(UUID doctorId, VisitStatus status);
    List<VisitModel> findByDoctorIdOrderByGmtCreateDesc(UUID doctorId);
}
