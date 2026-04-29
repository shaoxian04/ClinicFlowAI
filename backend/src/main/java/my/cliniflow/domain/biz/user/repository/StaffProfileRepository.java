package my.cliniflow.domain.biz.user.repository;

import my.cliniflow.domain.biz.user.model.StaffProfileModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface StaffProfileRepository extends JpaRepository<StaffProfileModel, UUID> {
    Optional<StaffProfileModel> findByUserId(UUID userId);
    boolean existsByEmployeeId(String employeeId);
}
