package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.service.exception.CancelWindowPassedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

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

class AppointmentCancelDomainServiceTest {

    static final UUID APPT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000a01");
    static final UUID SLOT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000a02");
    static final UUID DOCTOR_ID  = UUID.fromString("00000000-0000-0000-0000-000000000a03");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000a04");
    static final UUID VISIT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000a05");
    static final UUID USER_ID    = UUID.fromString("00000000-0000-0000-0000-000000000a06");

    static final int LEAD_HOURS = 2;
    static final OffsetDateTime SLOT_START = OffsetDateTime.parse("2026-05-04T10:00:00+08:00");
    static final OffsetDateTime SLOT_END   = OffsetDateTime.parse("2026-05-04T10:15:00+08:00");

    AppointmentRepository apptRepo;
    AppointmentSlotRepository slotRepo;
    AppointmentCancelDomainService svc;

    @BeforeEach
    void setUp() {
        apptRepo = mock(AppointmentRepository.class);
        slotRepo = mock(AppointmentSlotRepository.class);
        svc = new AppointmentCancelDomainServiceImpl(apptRepo, slotRepo);
    }

    private AppointmentModel bookedAppointment() {
        return AppointmentModel.hydrate(APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null);
    }

    private AppointmentSlotModel bookedSlot() {
        return AppointmentSlotModel.hydrate(SLOT_ID, DOCTOR_ID, SLOT_START, SLOT_END,
            SlotStatus.BOOKED);
    }

    @Test
    void cancel_happy_path_cancels_appointment_and_releases_slot() {
        AppointmentModel appt = bookedAppointment();
        AppointmentSlotModel slot = bookedSlot();
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(slot));

        // 5 hours before slot — well above 2h lead time
        OffsetDateTime now = SLOT_START.minusHours(5);
        svc.cancel(APPT_ID, USER_ID, now, "patient-changed-mind", LEAD_HOURS);

        assertThat(appt.getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(appt.getCancelReason()).isEqualTo("patient-changed-mind");
        assertThat(appt.getCancelledBy()).isEqualTo(USER_ID);
        assertThat(slot.getStatus()).isEqualTo(SlotStatus.AVAILABLE);
        verify(apptRepo).save(appt);
        verify(slotRepo).save(slot);
    }

    @Test
    void boundary_exactly_lead_hours_away_succeeds() {
        AppointmentModel appt = bookedAppointment();
        AppointmentSlotModel slot = bookedSlot();
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(slot));

        // exactly 2h before slot (= 120 min). minutesUntilStart = 120, cutoff = 120 → 120 < 120 is FALSE → succeeds.
        OffsetDateTime now = SLOT_START.minusHours(LEAD_HOURS);

        svc.cancel(APPT_ID, USER_ID, now, "ok", LEAD_HOURS);
        assertThat(appt.getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
    }

    @Test
    void boundary_one_minute_past_threshold_throws() {
        AppointmentModel appt = bookedAppointment();
        AppointmentSlotModel slot = bookedSlot();
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.of(slot));

        // 119 minutes before slot — just past the 2h cutoff
        OffsetDateTime now = SLOT_START.minusMinutes(LEAD_HOURS * 60L - 1);

        assertThatThrownBy(() -> svc.cancel(APPT_ID, USER_ID, now, "too-late", LEAD_HOURS))
            .isInstanceOf(CancelWindowPassedException.class)
            .hasMessageContaining("2h");

        // Crucially: state was NOT mutated and nothing was saved
        assertThat(appt.getStatus()).isEqualTo(AppointmentStatus.BOOKED);
        assertThat(slot.getStatus()).isEqualTo(SlotStatus.BOOKED);
        verify(apptRepo, never()).save(any());
        verify(slotRepo, never()).save(any());
    }

    @Test
    void throws_when_appointment_not_found() {
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.cancel(APPT_ID, USER_ID, SLOT_START.minusHours(5),
                "x", LEAD_HOURS))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("not found");
    }

    @Test
    void throws_when_appointment_not_in_BOOKED_status() {
        AppointmentModel cancelled = AppointmentModel.hydrate(APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.CANCELLED, "earlier", SLOT_START.minusDays(1), USER_ID);
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(cancelled));

        assertThatThrownBy(() -> svc.cancel(APPT_ID, USER_ID, SLOT_START.minusHours(5),
                "again", LEAD_HOURS))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("CANCELLED");
        verify(slotRepo, never()).findByIdForUpdate(any());
    }

    @Test
    void throws_when_slot_row_missing() {
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(bookedAppointment()));
        when(slotRepo.findByIdForUpdate(SLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.cancel(APPT_ID, USER_ID, SLOT_START.minusHours(5),
                "x", LEAD_HOURS))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("slot row missing");
    }
}
