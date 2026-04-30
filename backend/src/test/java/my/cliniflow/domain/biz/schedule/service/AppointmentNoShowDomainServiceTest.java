package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AppointmentNoShowDomainServiceTest {

    static final UUID APPT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000d01");
    static final UUID SLOT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000d02");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000d03");
    static final UUID VISIT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000d04");

    AppointmentRepository appts;
    AppointmentNoShowDomainService svc;

    @BeforeEach
    void setUp() {
        appts = mock(AppointmentRepository.class);
        svc = new AppointmentNoShowDomainService(appts);
    }

    private AppointmentModel appointment(AppointmentStatus status) {
        return AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            status, null, null, null);
    }

    @Test
    void marks_booked_appointment_as_no_show() {
        AppointmentModel booked = appointment(AppointmentStatus.BOOKED);
        when(appts.findById(APPT_ID)).thenReturn(Optional.of(booked));
        when(appts.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AppointmentModel result = svc.markNoShow(APPT_ID);

        assertThat(result.getStatus()).isEqualTo(AppointmentStatus.NO_SHOW);
        verify(appts).save(booked);
    }

    @Test
    void throws_when_already_cancelled() {
        AppointmentModel cancelled = appointment(AppointmentStatus.CANCELLED);
        when(appts.findById(APPT_ID)).thenReturn(Optional.of(cancelled));

        assertThatThrownBy(() -> svc.markNoShow(APPT_ID))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("CANCELLED");

        verify(appts, never()).save(any());
    }

    @Test
    void throws_when_appointment_not_found() {
        when(appts.findById(APPT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> svc.markNoShow(APPT_ID))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("not found");

        verify(appts, never()).save(any());
    }
}
