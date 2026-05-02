package my.cliniflow.application.biz.staff;

import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StaffWriteAppServiceTest {

    private static final UUID ACTOR    = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
    private static final UUID APPT_ID  = UUID.fromString("00000000-0000-0000-0000-0000000000b1");
    private static final UUID SLOT_ID  = UUID.fromString("00000000-0000-0000-0000-0000000000c1");
    private static final UUID PATIENT  = UUID.fromString("00000000-0000-0000-0000-0000000000d1");
    private static final UUID VISIT_ID = UUID.fromString("00000000-0000-0000-0000-0000000000e1");

    /**
     * Builds an {@link AppointmentModel} directly via the {@code hydrate}
     * factory used by the infrastructure layer (the same approach taken by
     * the schedule write-app-service tests). Uses {@link AppointmentType#NEW_SYMPTOM}
     * and a null {@code parentVisitId} since the appointment type doesn't
     * affect check-in semantics.
     */
    private AppointmentModel makeAppointmentInStatus(AppointmentStatus status) {
        return AppointmentModel.hydrate(
            APPT_ID,
            SLOT_ID,
            PATIENT,
            VISIT_ID,
            AppointmentType.NEW_SYMPTOM,
            null,
            status,
            null,
            null,
            null,
            null);
    }

    @Test
    void checkInBookedAppointmentSetsCheckedInAndAuditsWithMetadata() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = makeAppointmentInStatus(AppointmentStatus.BOOKED);
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        svc.checkIn(APPT_ID, ACTOR);

        assertThat(appt.getStatus()).isEqualTo(AppointmentStatus.CHECKED_IN);
        assertThat(appt.getCheckedInAt()).isNotNull();
        verify(apptRepo).save(appt);

        @SuppressWarnings({"rawtypes", "unchecked"})
        ArgumentCaptor<Map> meta = ArgumentCaptor.forClass(Map.class);
        verify(audit).append(
            eq("UPDATE"),
            eq("APPOINTMENT"),
            eq(APPT_ID.toString()),
            eq(ACTOR),
            eq("STAFF"),
            meta.capture());
        assertThat((Map<String, Object>) meta.getValue()).containsEntry("checked_in", true);
    }

    @Test
    void checkInAlreadyCheckedInIsIdempotentNoAuditNoSave() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = makeAppointmentInStatus(AppointmentStatus.CHECKED_IN);
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        svc.checkIn(APPT_ID, ACTOR);

        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
        verify(apptRepo, never()).save(any());
    }

    @Test
    void checkInCancelledRejectedWithConflict() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = makeAppointmentInStatus(AppointmentStatus.CANCELLED);
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        assertThatThrownBy(() -> svc.checkIn(APPT_ID, ACTOR))
            .isInstanceOf(ConflictException.class);
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
        verify(apptRepo, never()).save(any());
    }

    @Test
    void checkInNoShowRejectedWithConflict() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = makeAppointmentInStatus(AppointmentStatus.NO_SHOW);
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        assertThatThrownBy(() -> svc.checkIn(APPT_ID, ACTOR))
            .isInstanceOf(ConflictException.class);
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
        verify(apptRepo, never()).save(any());
    }

    @Test
    void checkInCompletedRejectedWithConflict() {
        var apptRepo = mock(AppointmentRepository.class);
        var audit = mock(AuditWriter.class);
        var appt = makeAppointmentInStatus(AppointmentStatus.COMPLETED);
        when(apptRepo.findById(APPT_ID)).thenReturn(Optional.of(appt));

        var svc = new StaffWriteAppService(apptRepo, audit);
        assertThatThrownBy(() -> svc.checkIn(APPT_ID, ACTOR))
            .isInstanceOf(ConflictException.class);
        verify(audit, never()).append(any(), any(), any(), any(), any(), any());
        verify(apptRepo, never()).save(any());
    }
}
