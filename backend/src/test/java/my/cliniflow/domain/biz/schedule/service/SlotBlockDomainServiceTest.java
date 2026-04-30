package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.enums.OverrideType;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleDayOverrideRepository;
import my.cliniflow.domain.biz.schedule.service.exception.BookingsInWindowException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SlotBlockDomainServiceTest {

    static final UUID DOCTOR_ID = UUID.fromString("00000000-0000-0000-0000-000000000c01");
    static final UUID USER_ID   = UUID.fromString("00000000-0000-0000-0000-000000000c02");
    static final UUID APPT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000c03");
    static final UUID SLOT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000c04");
    static final UUID VISIT_ID  = UUID.fromString("00000000-0000-0000-0000-000000000c05");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000c06");

    static final LocalDate DATE          = LocalDate.of(2026, 5, 10);
    static final LocalTime WINDOW_START  = LocalTime.of(9, 0);
    static final LocalTime WINDOW_END    = LocalTime.of(11, 0);

    AppointmentRepository apptRepo;
    ScheduleDayOverrideRepository overrideRepo;
    SlotBlockDomainService svc;

    @BeforeEach
    void setUp() {
        apptRepo = mock(AppointmentRepository.class);
        overrideRepo = mock(ScheduleDayOverrideRepository.class);
        svc = new SlotBlockDomainService(apptRepo, overrideRepo);
    }

    private AppointmentModel bookedAppointment() {
        return AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null);
    }

    // -----------------------------------------------------------------------
    // blockWindow tests
    // -----------------------------------------------------------------------

    @Test
    void block_window_rejects_when_active_booking_overlaps() {
        when(apptRepo.findByDoctorAndDayWindow(
                eq(DOCTOR_ID), any(OffsetDateTime.class), any(OffsetDateTime.class), any()))
            .thenReturn(List.of(bookedAppointment()));

        assertThatThrownBy(() ->
            svc.blockWindow(DOCTOR_ID, DATE, WINDOW_START, WINDOW_END, "maintenance", USER_ID))
            .isInstanceOf(BookingsInWindowException.class);

        verify(overrideRepo, never()).save(any());
    }

    @Test
    void block_window_creates_override_when_no_overlap() {
        when(apptRepo.findByDoctorAndDayWindow(
                eq(DOCTOR_ID), any(OffsetDateTime.class), any(OffsetDateTime.class), any()))
            .thenReturn(List.of());
        when(overrideRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<ScheduleDayOverrideModel> captor =
            ArgumentCaptor.forClass(ScheduleDayOverrideModel.class);

        svc.blockWindow(DOCTOR_ID, DATE, WINDOW_START, WINDOW_END, "maintenance", USER_ID);

        verify(overrideRepo).save(captor.capture());
        ScheduleDayOverrideModel saved = captor.getValue();
        assertThat(saved.getType()).isEqualTo(OverrideType.WINDOW_BLOCKED);
        assertThat(saved.getDoctorId()).isEqualTo(DOCTOR_ID);
        assertThat(saved.getOverrideDate()).isEqualTo(DATE);
        assertThat(saved.getWindowStart()).isEqualTo(WINDOW_START);
        assertThat(saved.getWindowEnd()).isEqualTo(WINDOW_END);
    }

    // -----------------------------------------------------------------------
    // closeDay tests
    // -----------------------------------------------------------------------

    @Test
    void close_day_rejects_when_any_active_booking_exists() {
        when(apptRepo.findByDoctorAndDayWindow(
                eq(DOCTOR_ID), any(OffsetDateTime.class), any(OffsetDateTime.class), any()))
            .thenReturn(List.of(bookedAppointment()));

        assertThatThrownBy(() ->
            svc.closeDay(DOCTOR_ID, DATE, "holiday", USER_ID))
            .isInstanceOf(BookingsInWindowException.class);

        verify(overrideRepo, never()).save(any());
    }

    @Test
    void close_day_creates_override_when_no_active_bookings() {
        when(apptRepo.findByDoctorAndDayWindow(
                eq(DOCTOR_ID), any(OffsetDateTime.class), any(OffsetDateTime.class), any()))
            .thenReturn(List.of());
        when(overrideRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<ScheduleDayOverrideModel> captor =
            ArgumentCaptor.forClass(ScheduleDayOverrideModel.class);

        svc.closeDay(DOCTOR_ID, DATE, "holiday", USER_ID);

        verify(overrideRepo).save(captor.capture());
        ScheduleDayOverrideModel saved = captor.getValue();
        assertThat(saved.getType()).isEqualTo(OverrideType.DAY_CLOSED);
        assertThat(saved.getDoctorId()).isEqualTo(DOCTOR_ID);
        assertThat(saved.getOverrideDate()).isEqualTo(DATE);
        assertThat(saved.getWindowStart()).isNull();
        assertThat(saved.getWindowEnd()).isNull();
    }
}
