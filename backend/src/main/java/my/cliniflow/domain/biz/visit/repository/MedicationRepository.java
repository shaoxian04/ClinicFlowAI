package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.MedicationModel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface MedicationRepository extends JpaRepository<MedicationModel, UUID> {
    List<MedicationModel> findByVisitIdOrderByGmtCreateAsc(UUID visitId);

    @Transactional
    void deleteByVisitId(UUID visitId);
}
