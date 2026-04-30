package my.cliniflow.infrastructure.repository.schedule;

import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Round-trip integration test for {@link AppointmentEntity}.
 *
 * <p>Uses seeded rows:
 * <ul>
 *   <li>DOCTOR user   = 00000000-0000-0000-0000-000000000001</li>
 *   <li>doctor record = 00000000-0000-0000-0000-000000000020</li>
 *   <li>PATIENT user  = 00000000-0000-0000-0000-000000000002</li>
 *   <li>patient row   = 00000000-0000-0000-0000-000000000010</li>
 * </ul>
 *
 * <p>A {@code visits} row is created fresh in each test to satisfy the FK
 * constraint on {@code appointments.visit_id}.
 *
 * <p><strong>Partial unique index caveat:</strong> Production Postgres enforces
 * that only one appointment per slot can have status='BOOKED' via a partial
 * unique index. H2 does not support partial unique indexes, so this IT
 * demonstrates that rebooking a previously-cancelled slot is NOT blocked at
 * the DB level in the test environment. The app layer is responsible for
 * enforcing single-active-booking semantics in production.
 */
@SpringBootTest
@Transactional
class AppointmentEntityIT {

    static final UUID DOCTOR_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID DOCTOR_ID      = UUID.fromString("00000000-0000-0000-0000-000000000020");
    static final UUID PATIENT_ID     = UUID.fromString("00000000-0000-0000-0000-000000000010");

    static final OffsetDateTime BASE =
        OffsetDateTime.of(2026, 5, 10, 9, 0, 0, 0, ZoneOffset.UTC);

    @Autowired AppointmentJpaRepository     appointmentRepo;
    @Autowired AppointmentSlotJpaRepository slotRepo;
    @Autowired VisitRepository              visitRepo;

    @Test
    void save_and_findById_roundTrip() {
        AppointmentSlotEntity slot = saveSlot(BASE);
        VisitModel visit = saveVisit();

        AppointmentEntity appt = buildAppointment(slot.getId(), visit.getId(), "NEW_SYMPTOM");
        AppointmentEntity saved = appointmentRepo.saveAndFlush(appt);

        assertThat(saved.getId()).isNotNull();

        AppointmentEntity loaded = appointmentRepo.findById(saved.getId()).orElseThrow();
        assertThat(loaded.getSlotId()).isEqualTo(slot.getId());
        assertThat(loaded.getPatientId()).isEqualTo(PATIENT_ID);
        assertThat(loaded.getStatus()).isEqualTo("BOOKED");
        assertThat(loaded.getAppointmentType()).isEqualTo("NEW_SYMPTOM");
    }

    @Test
    void cancel_and_rebook_notBlockedAtDbLevel() {
        /*
         * Production Postgres partial unique (WHERE status='BOOKED') would
         * prevent two concurrent BOOKED rows for the same slot. In H2 that
         * partial unique is absent, so this test verifies the rebook path
         * is NOT blocked at DB level — correct test-env behaviour.
         */
        AppointmentSlotEntity slot   = saveSlot(BASE.plusHours(1));
        VisitModel            visit1 = saveVisit();
        VisitModel            visit2 = saveVisit();

        // First booking
        AppointmentEntity first = buildAppointment(slot.getId(), visit1.getId(), "FOLLOW_UP");
        appointmentRepo.saveAndFlush(first);

        // Cancel it
        first.setStatus("CANCELLED");
        first.setCancelReason("patient_request");
        first.setCancelledAt(OffsetDateTime.now(ZoneOffset.UTC));
        appointmentRepo.saveAndFlush(first);

        // Rebook the same slot for a new visit — must succeed at DB level
        AppointmentEntity second = buildAppointment(slot.getId(), visit2.getId(), "NEW_SYMPTOM");
        AppointmentEntity savedSecond = appointmentRepo.saveAndFlush(second);
        assertThat(savedSecond.getId()).isNotNull();
        assertThat(savedSecond.getStatus()).isEqualTo("BOOKED");
    }

    @Test
    void findFirstBySlotIdAndStatus_returnsCorrectRow() {
        AppointmentSlotEntity slot  = saveSlot(BASE.plusHours(2));
        VisitModel            visit = saveVisit();

        AppointmentEntity appt = buildAppointment(slot.getId(), visit.getId(), "NEW_SYMPTOM");
        appointmentRepo.saveAndFlush(appt);

        Optional<AppointmentEntity> found =
            appointmentRepo.findFirstBySlotIdAndStatus(slot.getId(), "BOOKED");
        assertThat(found).isPresent();
        assertThat(found.get().getSlotId()).isEqualTo(slot.getId());
    }

    @Test
    void findByPatientId_returnsAllAppointments() {
        AppointmentSlotEntity slot1 = saveSlot(BASE.plusHours(3));
        AppointmentSlotEntity slot2 = saveSlot(BASE.plusHours(4));
        VisitModel v1 = saveVisit();
        VisitModel v2 = saveVisit();

        appointmentRepo.saveAndFlush(buildAppointment(slot1.getId(), v1.getId(), "NEW_SYMPTOM"));
        appointmentRepo.saveAndFlush(buildAppointment(slot2.getId(), v2.getId(), "FOLLOW_UP"));

        List<AppointmentEntity> results = appointmentRepo.findByPatientId(PATIENT_ID);
        assertThat(results).hasSizeGreaterThanOrEqualTo(2);
    }

    @Test
    void findByDoctorOnDate_returnsAppointmentsForDate() {
        LocalDate targetDate = LocalDate.of(2026, 5, 15);
        OffsetDateTime day   = OffsetDateTime.of(2026, 5, 15, 9, 0, 0, 0, ZoneOffset.UTC);

        AppointmentSlotEntity slot  = saveSlot(day);
        VisitModel            visit = saveVisit();

        appointmentRepo.saveAndFlush(buildAppointment(slot.getId(), visit.getId(), "NEW_SYMPTOM"));

        List<AppointmentEntity> results =
            appointmentRepo.findByDoctorOnDate(DOCTOR_ID, targetDate);
        assertThat(results).hasSizeGreaterThanOrEqualTo(1);
        assertThat(results.get(0).getSlotId()).isEqualTo(slot.getId());
    }

    @Test
    void findFirstByVisitIdAndStatus_returnsMatchingRow() {
        AppointmentSlotEntity slot  = saveSlot(BASE.plusHours(5));
        VisitModel            visit = saveVisit();

        AppointmentEntity appt = buildAppointment(slot.getId(), visit.getId(), "NEW_SYMPTOM");
        appointmentRepo.saveAndFlush(appt);

        Optional<AppointmentEntity> found =
            appointmentRepo.findFirstByVisitIdAndStatus(visit.getId(), "BOOKED");
        assertThat(found).isPresent();
        assertThat(found.get().getVisitId()).isEqualTo(visit.getId());
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private AppointmentSlotEntity saveSlot(OffsetDateTime start) {
        AppointmentSlotEntity s = new AppointmentSlotEntity();
        s.setDoctorId(DOCTOR_ID);
        s.setStartAt(start);
        s.setEndAt(start.plusMinutes(15));
        s.setStatus("AVAILABLE");
        return slotRepo.saveAndFlush(s);
    }

    private VisitModel saveVisit() {
        VisitModel v = new VisitModel();
        v.setPatientId(PATIENT_ID);
        v.setDoctorId(DOCTOR_USER_ID); // visits.doctor_id references users(id)
        return visitRepo.saveAndFlush(v);
    }

    private AppointmentEntity buildAppointment(UUID slotId, UUID visitId, String type) {
        AppointmentEntity a = new AppointmentEntity();
        a.setSlotId(slotId);
        a.setPatientId(PATIENT_ID);
        a.setVisitId(visitId);
        a.setAppointmentType(type);
        a.setStatus("BOOKED");
        return a;
    }
}
