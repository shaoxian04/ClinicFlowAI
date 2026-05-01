package my.cliniflow.infrastructure.dev;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import my.cliniflow.domain.biz.schedule.service.ScheduleTemplateUpdateDomainService;
import my.cliniflow.domain.biz.schedule.service.SlotGenerateDomainService;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@Profile({"local", "docker"})
public class DevDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

    private static final UUID DOCTOR_ID        = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID PATIENT_ID       = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID ADMIN_USER_ID    = UUID.fromString("00000000-0000-0000-0000-000000000003");
    private static final UUID PATIENT_RECORD_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID DOCTORS_PK       = UUID.fromString("00000000-0000-0000-0000-000000000020");

    private final UserRepository userRepo;
    private final PatientRepository patientRepo;
    private final PasswordEncoder encoder;
    private final JdbcTemplate jdbc;
    private final ScheduleTemplateUpdateDomainService templateUpdateSvc;
    private final SlotGenerateDomainService slotGenSvc;
    private final ScheduleTemplateRepository templateRepo;
    private final TransactionTemplate tx;

    public DevDataSeeder(UserRepository userRepo,
                         PatientRepository patientRepo,
                         PasswordEncoder encoder,
                         JdbcTemplate jdbc,
                         ScheduleTemplateUpdateDomainService templateUpdateSvc,
                         SlotGenerateDomainService slotGenSvc,
                         ScheduleTemplateRepository templateRepo,
                         TransactionTemplate tx) {
        this.userRepo = userRepo;
        this.patientRepo = patientRepo;
        this.encoder = encoder;
        this.jdbc = jdbc;
        this.templateUpdateSvc = templateUpdateSvc;
        this.slotGenSvc = slotGenSvc;
        this.templateRepo = templateRepo;
        this.tx = tx;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            seedUser(DOCTOR_ID, "doctor@demo.local", Role.DOCTOR, "Dr. Demo");
            seedUser(PATIENT_ID, "patient@demo.local", Role.PATIENT, "Pat Demo");
            seedUser(ADMIN_USER_ID, "admin@demo.local", Role.ADMIN, "Admin Demo");
            seedPatient();
            seedDoctorRow();
            seedScheduleTemplateAndSlots();
        } catch (Exception e) {
            log.warn("DevDataSeeder encountered an error during seeding — startup continues", e);
        }
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

    /**
     * Idempotently inserts the doctor row that {@code appointment_slots.doctor_id}
     * FKs into. Different from the doctor USER row — the schedule context uses
     * {@code doctors(id)} as the foreign key, not {@code users(id)}.
     */
    private void seedDoctorRow() {
        Integer count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM doctors WHERE id = ?", Integer.class, DOCTORS_PK);
        if (count != null && count > 0) return;
        jdbc.update(
            "INSERT INTO doctors (id, user_id, mmc_number, specialty, is_accepting_patients) " +
            "VALUES (?, ?, ?, ?, TRUE)",
            DOCTORS_PK, DOCTOR_ID, "MMC-DEMO", "General");
    }

    /**
     * Idempotently upserts the demo schedule template and materializes slots for
     * the next 14 days. Re-running on each app start is safe — the
     * {@code SlotGenerateDomainService} deletes future-AVAILABLE slots before
     * regenerating, so already-BOOKED slots are preserved.
     */
    private void seedScheduleTemplateAndSlots() {
        // Both branches issue @Modifying JPQL deletes (slotGenSvc.deleteFutureAvailable),
        // so the work must run inside a Spring transaction. ApplicationRunner.run is
        // not transactional by itself.
        tx.executeWithoutResult(status -> {
            if (templateRepo.findCurrentForDoctor(DOCTORS_PK).isPresent()) {
                var existing = templateRepo.findCurrentForDoctor(DOCTORS_PK).orElseThrow();
                slotGenSvc.generate(existing, OffsetDateTime.now());
                return;
            }
            WeeklyHours wh = WeeklyHours.fromJson(Map.of(
                "MON", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
                "TUE", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
                "WED", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
                "THU", List.of(List.of("09:00", "12:00"), List.of("14:00", "17:00")),
                "FRI", List.of(List.of("09:00", "12:00"))
            ));
            var saved = templateUpdateSvc.upsert(
                DOCTORS_PK,
                LocalDate.now(),
                (short) 30,
                wh,
                (short) 2,
                (short) 14);
            slotGenSvc.generate(saved, OffsetDateTime.now());
        });
    }
}
