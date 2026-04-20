package my.cliniflow.domain.biz.patient.repository;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PatientRepository extends JpaRepository<PatientModel, UUID> {
}
