package my.cliniflow.domain.biz.user.repository;

import my.cliniflow.domain.biz.user.model.UserModel;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<UserModel, UUID> {
    Optional<UserModel> findByEmail(String email);
}
