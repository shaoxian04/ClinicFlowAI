package my.cliniflow.application.biz.user;

import my.cliniflow.domain.biz.user.model.UserModel;

import java.util.Optional;
import java.util.UUID;

public interface UserReadAppService {

    UserModel getById(UUID id);

    Optional<UserModel> findByEmail(String email);
}
