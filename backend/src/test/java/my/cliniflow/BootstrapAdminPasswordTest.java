package my.cliniflow;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Generates the bcrypt hash for the bootstrap admin password and verifies
 * it round-trips. Run with `-Dtest=BootstrapAdminPasswordTest` to print
 * the hash for V10__bootstrap_admin.sql.
 */
class BootstrapAdminPasswordTest {

    private static final String PASSWORD = "ChangeMe-Admin-12345";

    @Test
    void roundTrip() {
        BCryptPasswordEncoder enc = new BCryptPasswordEncoder(12);
        String hash = enc.encode(PASSWORD);
        System.out.println("BOOTSTRAP_ADMIN_HASH=" + hash);
        assertThat(enc.matches(PASSWORD, hash)).isTrue();
    }
}
