package my.cliniflow.infrastructure.repository.schedule;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for {@link AppointmentRepositoryImpl} — validates round-trip
 * persistence behaviour of {@link AppointmentModel} via the domain repository interface.
 *
 * <p>Seeded data:
 * <ul>
 *   <li>DOCTOR user   = 00000000-0000-0000-0000-000000000001</li>
 *   <li>doctor record = 00000000-0000-0000-0000-000000000020</li>
 *   <li>patient row   = 00000000-0000-0000-0000-000000000010</li>
 * </ul>
 *
 * <p><strong>Note:</strong> The partial unique index
 * {@code (slot_id) WHERE status='BOOKED'} from production Postgres is omitted
 * in the H2 test schema. Tests that require this constraint to be enforced are
 * not included here — see schema.sql for details.
 */
@SpringBootTest
@Transactional
class AppointmentRepositoryImplIT {

    static final UUID DOCTOR_ID  = UUID.fromString("00000000-0000-0000-0000-000000000020");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired AppointmentRepository appts;
    @Autowired AppointmentSlotRepository slots;
    @Autowired JdbcTemplate jdbc;

    UUID seedSlot() {
        AppointmentSlotModel slot = AppointmentSlotModel.newAvailable(
            DOCTOR_ID,
            OffsetDateTime.parse("2026-05-04T09:00:00+08:00"),
            OffsetDateTime.parse("2026-05-04T09:15:00+08:00"));
        return slots.save(slot).getId();
    }

    UUID seedVisit() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO visits (id, patient_id, doctor_id, status) VALUES (?, ?, ?, 'SCHEDULED')",
                    id, PATIENT_ID, UUID.fromString("00000000-0000-0000-0000-000000000001"));
        return id;
    }

    @Test
    void save_and_findById_roundTrip_new_symptom() {
        UUID slotId = seedSlot();
        UUID visitId = seedVisit();
        AppointmentModel m = AppointmentModel.book(slotId, PATIENT_ID, visitId,
            AppointmentType.NEW_SYMPTOM, null);
        AppointmentModel saved = appts.save(m);
        assertThat(saved.getId()).isNotNull();
        AppointmentModel found = appts.findById(saved.getId()).orElseThrow();
        assertThat(found.getStatus()).isEqualTo(AppointmentStatus.BOOKED);
        assertThat(found.getType()).isEqualTo(AppointmentType.NEW_SYMPTOM);
        assertThat(found.getSlotId()).isEqualTo(slotId);
        assertThat(found.getPatientId()).isEqualTo(PATIENT_ID);
        assertThat(found.getVisitId()).isEqualTo(visitId);
    }

    @Test
    void cancel_persists_metadata() {
        UUID slotId = seedSlot();
        UUID visitId = seedVisit();
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        AppointmentModel m = AppointmentModel.book(slotId, PATIENT_ID, visitId,
            AppointmentType.NEW_SYMPTOM, null);
        AppointmentModel saved = appts.save(m);
        OffsetDateTime now = OffsetDateTime.parse("2026-05-04T08:00:00+08:00");
        saved.cancel("patient-changed-mind", userId, now);
        appts.save(saved);
        AppointmentModel reread = appts.findById(saved.getId()).orElseThrow();
        assertThat(reread.getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(reread.getCancelReason()).isEqualTo("patient-changed-mind");
        assertThat(reread.getCancelledAt()).isEqualTo(now);
        assertThat(reread.getCancelledBy()).isEqualTo(userId);
    }

    @Test
    void findActiveByVisitId_returns_only_BOOKED() {
        UUID slotId = seedSlot();
        UUID visitId = seedVisit();
        UUID userId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        AppointmentModel m = AppointmentModel.book(slotId, PATIENT_ID, visitId,
            AppointmentType.NEW_SYMPTOM, null);
        AppointmentModel saved = appts.save(m);
        assertThat(appts.findActiveByVisitId(visitId)).isPresent();

        saved.cancel("x", userId, OffsetDateTime.now());
        appts.save(saved);
        assertThat(appts.findActiveByVisitId(visitId)).isEmpty();
    }

    @Test
    void findByPatient_returns_all_statuses() {
        UUID slotId = seedSlot();
        UUID visitId = seedVisit();
        appts.save(AppointmentModel.book(slotId, PATIENT_ID, visitId,
            AppointmentType.NEW_SYMPTOM, null));
        assertThat(appts.findByPatient(PATIENT_ID)).hasSize(1);
    }
}
