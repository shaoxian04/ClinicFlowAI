package my.cliniflow.infrastructure.dev;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Component
@Profile("local")
public class DevDataSeeder implements ApplicationRunner {

    private static final UUID DOCTOR_ID  = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID PATIENT_RECORD_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    private final UserRepository userRepo;
    private final PatientRepository patientRepo;
    private final PasswordEncoder encoder;

    public DevDataSeeder(UserRepository userRepo, PatientRepository patientRepo, PasswordEncoder encoder) {
        this.userRepo = userRepo;
        this.patientRepo = patientRepo;
        this.encoder = encoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        seedUser(DOCTOR_ID, "doctor@demo.local", Role.DOCTOR, "Dr. Demo");
        seedUser(PATIENT_ID, "patient@demo.local", Role.PATIENT, "Pat Demo");
        seedPatient();
    }

    private void seedUser(UUID id, String email, Role role, String fullName) {
        UserModel u = userRepo.findByEmail(email).orElseGet(() -> {
            UserModel n = new UserModel();
            n.setId(id);
            OffsetDateTime now = OffsetDateTime.now();
            n.setGmtCreate(now);
            n.setGmtModified(now);
            return n;
        });
        u.setEmail(email);
        u.setPasswordHash(encoder.encode("password"));
        u.setRole(role);
        u.setFullName(fullName);
        u.setActive(true);
        userRepo.save(u);
    }

    private void seedPatient() {
        if (patientRepo.existsById(PATIENT_RECORD_ID)) return;
        PatientModel p = new PatientModel();
        p.setId(PATIENT_RECORD_ID);
        p.setUserId(PATIENT_ID);
        p.setFullName("Pat Demo");
        p.setDateOfBirth(LocalDate.of(1990, 1, 1));
        p.setGender("OTHER");
        p.setPhone("+60-12-000-0000");
        p.setEmail("patient@demo.local");
        patientRepo.save(p);
    }
}
