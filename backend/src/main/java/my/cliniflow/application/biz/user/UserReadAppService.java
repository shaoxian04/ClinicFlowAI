package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

@Service
public class UserReadAppService {

    private final UserRepository users;

    public UserReadAppService(UserRepository users) { this.users = users; }

    public UserModel getById(UUID id) {
        return users.findById(id).orElseThrow(
            () -> new ResourceNotFoundException("USER", id));
    }

    public Optional<UserModel> findByEmail(String email) {
        return users.findByEmail(email);
    }
}
