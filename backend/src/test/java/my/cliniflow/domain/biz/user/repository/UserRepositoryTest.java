package my.cliniflow.domain.biz.user.repository;

import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class UserRepositoryTest {

    @Autowired UserRepository repo;

    @Test
    void findByEmail_roundtrip() {
        UserModel u = new UserModel();
        u.setEmail("r1@example.com");
        u.setPasswordHash("$2a$10$fake");
        u.setRole(Role.DOCTOR);
        u.setFullName("Dr. Test");
        repo.save(u);

        var found = repo.findByEmail("r1@example.com");
        assertTrue(found.isPresent());
        assertEquals(Role.DOCTOR, found.get().getRole());
    }
}
