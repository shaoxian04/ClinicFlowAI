package my.cliniflow.domain.biz.patient.repository;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PatientRepository extends JpaRepository<PatientModel, UUID> {
    Optional<PatientModel> findByUserId(UUID userId);
    Optional<PatientModel> findByNationalIdFingerprint(String fingerprint);
    boolean existsByNationalIdFingerprint(String fingerprint);
    List<PatientModel> findTop10ByFullNameContainingIgnoreCaseOrderByFullNameAsc(String name);
}
