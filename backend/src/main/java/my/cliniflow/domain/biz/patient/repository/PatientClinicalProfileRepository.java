package my.cliniflow.domain.biz.patient.repository;

import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

/**
 * NOTE: per DDD aggregate rule, this repository is package-private to the patient aggregate.
 * External callers should go through PatientWriteAppService / PatientReadAppService.
 * It exists because the projection is loaded by patient_id, which is not the row PK.
 */
public interface PatientClinicalProfileRepository
        extends JpaRepository<PatientClinicalProfileModel, UUID> {
    Optional<PatientClinicalProfileModel> findByPatientId(UUID patientId);
}
