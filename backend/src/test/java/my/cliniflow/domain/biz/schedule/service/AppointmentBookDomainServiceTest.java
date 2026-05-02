package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.service.exception.SlotTakenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AppointmentBookDomainServiceTest {

    static final UUID SLOT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000a01");
    static final UUID DOCTOR_ID  = UUID.fromString("00000000-0000-0000-0000-000000000a02");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000a03");
    static final UUID VISIT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000a04");
    static final UUID APPT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000a05");

    AppointmentSlotRepository slotRepo;
    AppointmentRepository apptRepo;
    AppointmentBookDomainService svc;

    @BeforeEach
    void setUp() {
        slotRepo = mock(AppointmentSlotRepository.class);
        apptRepo = mock(AppointmentRepository.class);
        svc = new AppointmentBookDomainServiceImpl(slotRepo, apptRepo);
    }

    private AppointmentSlotModel availableSlot() {
        return AppointmentSlotModel.hydrate(
            SLOT_ID, DOCTOR_ID,
            OffsetDateTime.parse("2026-05-04T09:00:00+08:00"),
            OffsetDateTime.parse("2026-05-04T09:15:00+08:00"),
            SlotStatus.AVAILABLE);
    }

    @Test
    void books_slot_and_returns_appointment_with_hydrated_id() {
        AppointmentSlotModel slot = availableSlot();
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(slot));
        when(apptRepo.save(any())).thenAnswer(inv -> {
            AppointmentModel a = inv.getArgument(0);
            a.hydrateId(APPT_ID);
            return a;
        });

        AppointmentModel result = svc.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null);

        assertThat(result.getId()).isEqualTo(APPT_ID);
        assertThat(result.getStatus()).isEqualTo(AppointmentStatus.BOOKED);
        assertThat(slot.getStatus()).isEqualTo(SlotStatus.BOOKED);
        verify(slotRepo).save(slot);
    }

    @Test
    void throws_slot_taken_when_slot_not_found() {
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null))
            .isInstanceOf(SlotTakenException.class)
            .hasMessageContaining(SLOT_ID.toString());
        verify(apptRepo, never()).save(any());
    }

    @Test
    void throws_slot_taken_when_slot_already_booked() {
        AppointmentSlotModel slot = AppointmentSlotModel.hydrate(
            SLOT_ID, DOCTOR_ID,
            OffsetDateTime.parse("2026-05-04T09:00:00+08:00"),
            OffsetDateTime.parse("2026-05-04T09:15:00+08:00"),
            SlotStatus.BOOKED);
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(slot));

        assertThatThrownBy(() -> svc.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null))
            .isInstanceOf(SlotTakenException.class)
            .hasMessageContaining("not available");
        verify(slotRepo, never()).save(any());
        verify(apptRepo, never()).save(any());
    }

    @Test
    void throws_slot_taken_when_concurrent_booking_wins_unique_index() {
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(availableSlot()));
        when(apptRepo.save(any())).thenThrow(
            new DataIntegrityViolationException("uq_appointments_active_slot"));

        assertThatThrownBy(() -> svc.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null))
            .isInstanceOf(SlotTakenException.class)
            .hasMessageContaining("concurrently");
    }

    @Test
    void followup_booking_propagates_parent_visit_id() {
        UUID parentVisitId = UUID.fromString("00000000-0000-0000-0000-000000000a06");
        AppointmentSlotModel slot = availableSlot();
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(slot));
        when(apptRepo.save(any())).thenAnswer(inv -> {
            AppointmentModel a = inv.getArgument(0);
            a.hydrateId(APPT_ID);
            return a;
        });

        AppointmentModel result = svc.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.FOLLOW_UP, parentVisitId);

        assertThat(result.getType()).isEqualTo(AppointmentType.FOLLOW_UP);
        assertThat(result.getParentVisitId()).isEqualTo(parentVisitId);
    }
}
