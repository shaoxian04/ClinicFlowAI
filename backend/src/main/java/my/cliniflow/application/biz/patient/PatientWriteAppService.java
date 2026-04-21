package my.cliniflow.application.biz.patient;

import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class PatientWriteAppService {

    private final UserRepository users;
    private final JdbcTemplate jdbc;

    public PatientWriteAppService(UserRepository users, JdbcTemplate jdbc) {
        this.users = users;
        this.jdbc = jdbc;
    }

    @Transactional
    public void recordConsent(UUID userId, OffsetDateTime timestamp) {
        UserModel user = users.findById(userId).orElseThrow(
            () -> new IllegalArgumentException("user not found: " + userId));

        // PDPA invariant: append to audit_log (append-only table; never UPDATE/DELETE)
        jdbc.update(
            "INSERT INTO audit_log(occurred_at, actor_user_id, actor_role, action, resource_type, resource_id) VALUES (?,?,?,?,?,?)",
            timestamp, userId, user.getRole().name(), "CREATE", "CONSENT", userId.toString()
        );
    }
}
