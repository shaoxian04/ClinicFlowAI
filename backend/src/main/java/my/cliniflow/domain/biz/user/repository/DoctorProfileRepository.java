package my.cliniflow.domain.biz.user.repository;

import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DoctorProfileRepository extends JpaRepository<DoctorProfileModel, UUID> {
    Optional<DoctorProfileModel> findByUserId(UUID userId);
    boolean existsByMmcNumber(String mmcNumber);
}
