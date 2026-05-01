package my.cliniflow.infrastructure.repository.schedule;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
 * <p>A {@code visits} row is created fresh in each test via {@link JdbcTemplate}
 * to satisfy the FK constraint on {@code appointments.visit_id}, without
 * coupling this schedule-infra test to the visit domain layer.
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
    @Autowired JdbcTemplate                 jdbc;

    @Test
    void save_and_findById_roundTrip() {
        AppointmentSlotEntity slot    = saveSlot(BASE);
        UUID                  visitId = createTestVisit();

        AppointmentEntity appt = buildAppointment(slot.getId(), visitId, "NEW_SYMPTOM");
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
        AppointmentSlotEntity slot    = saveSlot(BASE.plusHours(1));
        UUID                  visitId1 = createTestVisit();
        UUID                  visitId2 = createTestVisit();

        // First booking
        AppointmentEntity first = buildAppointment(slot.getId(), visitId1, "FOLLOW_UP");
        appointmentRepo.saveAndFlush(first);

        // Cancel it
        first.setStatus("CANCELLED");
        first.setCancelReason("patient_request");
        first.setCancelledAt(OffsetDateTime.now(ZoneOffset.UTC));
        first.setCancelledBy(DOCTOR_USER_ID);
        appointmentRepo.saveAndFlush(first);

        // I3: reload and assert cancel fields persisted
        AppointmentEntity reloadedFirst = appointmentRepo.findById(first.getId()).orElseThrow();
        assertThat(reloadedFirst.getStatus()).isEqualTo("CANCELLED");
        assertThat(reloadedFirst.getCancelledAt()).isNotNull();
        assertThat(reloadedFirst.getCancelReason()).isEqualTo("patient_request");
        assertThat(reloadedFirst.getCancelledBy()).isEqualTo(DOCTOR_USER_ID);

        // Rebook the same slot for a new visit — must succeed at DB level
        AppointmentEntity second = buildAppointment(slot.getId(), visitId2, "NEW_SYMPTOM");
        AppointmentEntity savedSecond = appointmentRepo.saveAndFlush(second);
        assertThat(savedSecond.getId()).isNotNull();
        assertThat(savedSecond.getStatus()).isEqualTo("BOOKED");
    }

    @Test
    void findFirstBySlotIdAndStatus_returnsCorrectRow() {
        AppointmentSlotEntity slot    = saveSlot(BASE.plusHours(2));
        UUID                  visitId = createTestVisit();

        AppointmentEntity appt = buildAppointment(slot.getId(), visitId, "NEW_SYMPTOM");
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
        UUID v1 = createTestVisit();
        UUID v2 = createTestVisit();

        appointmentRepo.saveAndFlush(buildAppointment(slot1.getId(), v1, "NEW_SYMPTOM"));
        appointmentRepo.saveAndFlush(buildAppointment(slot2.getId(), v2, "FOLLOW_UP"));

        List<AppointmentEntity> results = appointmentRepo.findByPatientId(PATIENT_ID);
        assertThat(results).hasSize(2);
    }

    @Test
    void findByDoctorAndDayWindow_returnsAppointmentsForDate() {
        // M3: slot at 09:00 MYT on 2026-05-16 = 2026-05-15 01:00 UTC
        // The old CAST(startAt AS LocalDate) in UTC would have matched 2026-05-15, not 2026-05-16.
        // The new day-window query passes explicit MYT boundaries, so it correctly matches.
        ZoneId kl = ZoneId.of("Asia/Kuala_Lumpur");
        OffsetDateTime slotStart = LocalDate.of(2026, 5, 16).atTime(9, 0)
            .atZone(kl).toOffsetDateTime();

        AppointmentSlotEntity slot    = saveSlot(slotStart);
        UUID                  visitId = createTestVisit();

        appointmentRepo.saveAndFlush(buildAppointment(slot.getId(), visitId, "NEW_SYMPTOM"));

        OffsetDateTime dayStart = LocalDate.of(2026, 5, 16).atStartOfDay(kl).toOffsetDateTime();
        OffsetDateTime dayEnd   = LocalDate.of(2026, 5, 17).atStartOfDay(kl).toOffsetDateTime();

        List<AppointmentEntity> results =
            appointmentRepo.findByDoctorAndDayWindow(DOCTOR_ID, dayStart, dayEnd, Set.of("BOOKED"));
        assertThat(results).hasSize(1);
        assertThat(results.get(0).getSlotId()).isEqualTo(slot.getId());
    }

    @Test
    void findFirstByVisitIdAndStatus_returnsMatchingRow() {
        AppointmentSlotEntity slot    = saveSlot(BASE.plusHours(5));
        UUID                  visitId = createTestVisit();

        AppointmentEntity appt = buildAppointment(slot.getId(), visitId, "NEW_SYMPTOM");
        appointmentRepo.saveAndFlush(appt);

        Optional<AppointmentEntity> found =
            appointmentRepo.findFirstByVisitIdAndStatus(visitId, "BOOKED");
        assertThat(found).isPresent();
        assertThat(found.get().getVisitId()).isEqualTo(visitId);
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

    /**
     * Inserts a minimal {@code visits} row via JDBC to satisfy the FK constraint
     * on {@code appointments.visit_id}, without coupling this test to the visit
     * domain layer.
     *
     * <p>{@code visits.doctor_id} is FK to {@code users(id)}, so the seeded
     * DOCTOR user id (not the doctors-table id) is used.
     */
    private UUID createTestVisit() {
        UUID visitId = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO visits (id, patient_id, doctor_id, status) VALUES (?, ?, ?, ?)",
            visitId, PATIENT_ID, DOCTOR_USER_ID, "SCHEDULED");
        return visitId;
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
