package my.cliniflow.application.biz.schedule;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitReadAppService;
import my.cliniflow.application.biz.visit.VisitWriteAppService;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.biz.schedule.request.AppointmentBookRequest;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.event.AppointmentBookedDomainEvent;
import my.cliniflow.domain.biz.schedule.event.AppointmentCancelledDomainEvent;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import my.cliniflow.domain.biz.schedule.service.AppointmentBookDomainService;
import my.cliniflow.domain.biz.schedule.service.AppointmentCancelDomainService;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AppointmentWriteAppServiceTest {

    static final UUID USER_ID       = UUID.fromString("00000000-0000-0000-0000-000000000001");
    static final UUID PATIENT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000002");
    static final UUID SLOT_ID       = UUID.fromString("00000000-0000-0000-0000-000000000003");
    static final UUID VISIT_ID      = UUID.fromString("00000000-0000-0000-0000-000000000004");
    static final UUID APPT_ID       = UUID.fromString("00000000-0000-0000-0000-000000000005");
    static final UUID PARENT_VID    = UUID.fromString("00000000-0000-0000-0000-000000000006");
    static final UUID FOLLOW_UP_VID = UUID.fromString("00000000-0000-0000-0000-000000000007");
    static final UUID DOCTOR_ID     = UUID.fromString("00000000-0000-0000-0000-000000000008");

    AppointmentBookDomainService bookSvc;
    AppointmentCancelDomainService cancelSvc;
    AppointmentRepository appts;
    AppointmentSlotRepository slotRepo;
    ScheduleTemplateRepository templates;
    PatientReadAppService patientReads;
    VisitReadAppService visitReads;
    VisitWriteAppService visits;
    UserRepository users;
    AuditWriter audit;
    ApplicationEventPublisher events;

    AppointmentWriteAppService svc;

    @BeforeEach
    void setUp() {
        bookSvc      = mock(AppointmentBookDomainService.class);
        cancelSvc    = mock(AppointmentCancelDomainService.class);
        appts        = mock(AppointmentRepository.class);
        slotRepo     = mock(AppointmentSlotRepository.class);
        templates    = mock(ScheduleTemplateRepository.class);
        patientReads = mock(PatientReadAppService.class);
        visitReads   = mock(VisitReadAppService.class);
        visits       = mock(VisitWriteAppService.class);
        users        = mock(UserRepository.class);
        audit        = mock(AuditWriter.class);
        events       = mock(ApplicationEventPublisher.class);

        svc = new AppointmentWriteAppService(
            bookSvc, cancelSvc, appts, slotRepo, templates,
            patientReads, visitReads, visits, users, audit, events);

        // Common stubs
        PatientModel patient = mock(PatientModel.class);
        when(patient.getId()).thenReturn(PATIENT_ID);
        when(patientReads.findByUserId(USER_ID)).thenReturn(Optional.of(patient));

        UserModel user = new UserModel();
        user.setRole(Role.PATIENT);
        when(users.findById(USER_ID)).thenReturn(Optional.of(user));
    }

    // -----------------------------------------------------------------------
    // Test 1: book NEW_SYMPTOM — happy path
    // -----------------------------------------------------------------------

    @Test
    void book_new_symptom_publishes_event_and_writes_audit() {
        AppointmentBookRequest req = new AppointmentBookRequest(SLOT_ID, "NEW_SYMPTOM", VISIT_ID, null);

        AppointmentModel bookedAppt = AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null);
        when(bookSvc.book(SLOT_ID, PATIENT_ID, VISIT_ID, AppointmentType.NEW_SYMPTOM, null))
            .thenReturn(bookedAppt);

        UUID result = svc.book(USER_ID, req);

        assertThat(result).isEqualTo(APPT_ID);

        // Audit write: action=CREATE, resourceType=APPOINTMENT
        verify(audit).append(eq("CREATE"), eq("APPOINTMENT"), eq(APPT_ID.toString()), eq(USER_ID), eq("PATIENT"));

        // Event published once with correct type
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(captor.capture());
        Object evt = captor.getValue();
        assertThat(evt).isInstanceOf(AppointmentBookedDomainEvent.class);
        AppointmentBookedDomainEvent booked = (AppointmentBookedDomainEvent) evt;
        assertThat(booked.appointmentId()).isEqualTo(APPT_ID);
        assertThat(booked.patientId()).isEqualTo(PATIENT_ID);
        assertThat(booked.slotId()).isEqualTo(SLOT_ID);
    }

    // -----------------------------------------------------------------------
    // Test 2: book NEW_SYMPTOM without visitId — should throw BAD_REQUEST
    // -----------------------------------------------------------------------

    @Test
    void book_new_symptom_throws_when_visitId_missing() {
        AppointmentBookRequest req = new AppointmentBookRequest(SLOT_ID, "NEW_SYMPTOM", null, null);

        assertThatThrownBy(() -> svc.book(USER_ID, req))
            .isInstanceOf(BusinessException.class)
            .satisfies(ex -> assertThat(((BusinessException) ex).resultCode())
                .isEqualTo(ResultCode.BAD_REQUEST));

        verify(bookSvc, never()).book(any(), any(), any(), any(), any());
    }

    // -----------------------------------------------------------------------
    // Test 3: book FOLLOW_UP without parentVisitId — should throw BAD_REQUEST
    // -----------------------------------------------------------------------

    @Test
    void book_followup_throws_when_parentVisitId_missing() {
        AppointmentBookRequest req = new AppointmentBookRequest(SLOT_ID, "FOLLOW_UP", null, null);

        assertThatThrownBy(() -> svc.book(USER_ID, req))
            .isInstanceOf(BusinessException.class)
            .satisfies(ex -> assertThat(((BusinessException) ex).resultCode())
                .isEqualTo(ResultCode.BAD_REQUEST));

        verify(bookSvc, never()).book(any(), any(), any(), any(), any());
        verify(visits, never()).openFollowUpVisit(any(), any());
    }

    // -----------------------------------------------------------------------
    // Test 4: book FOLLOW_UP — opens follow-up visit then calls bookSvc
    // -----------------------------------------------------------------------

    @Test
    void book_followup_opens_follow_up_visit_and_books() {
        AppointmentBookRequest req = new AppointmentBookRequest(SLOT_ID, "FOLLOW_UP", null, PARENT_VID);

        when(visits.openFollowUpVisit(PATIENT_ID, PARENT_VID)).thenReturn(FOLLOW_UP_VID);

        AppointmentModel bookedAppt = AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, FOLLOW_UP_VID,
            AppointmentType.FOLLOW_UP, PARENT_VID,
            AppointmentStatus.BOOKED, null, null, null);
        when(bookSvc.book(SLOT_ID, PATIENT_ID, FOLLOW_UP_VID, AppointmentType.FOLLOW_UP, PARENT_VID))
            .thenReturn(bookedAppt);

        UUID result = svc.book(USER_ID, req);

        assertThat(result).isEqualTo(APPT_ID);
        verify(visits).openFollowUpVisit(PATIENT_ID, PARENT_VID);
        verify(bookSvc).book(SLOT_ID, PATIENT_ID, FOLLOW_UP_VID, AppointmentType.FOLLOW_UP, PARENT_VID);
    }

    // -----------------------------------------------------------------------
    // Test 5: cancel — happy path publishes event and writes audit
    // -----------------------------------------------------------------------

    @Test
    void cancel_publishes_cancelled_event_and_writes_audit() {
        AppointmentModel a = AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null);
        when(appts.findById(APPT_ID)).thenReturn(Optional.of(a));

        AppointmentSlotModel slot = AppointmentSlotModel.hydrate(
            SLOT_ID, DOCTOR_ID,
            OffsetDateTime.parse("2026-05-10T10:00:00+08:00"),
            OffsetDateTime.parse("2026-05-10T10:15:00+08:00"),
            SlotStatus.BOOKED);
        when(slotRepo.findById(SLOT_ID)).thenReturn(Optional.of(slot));
        when(templates.findCurrentForDoctor(DOCTOR_ID)).thenReturn(Optional.empty());

        svc.cancel(USER_ID, APPT_ID, "changed-mind");

        verify(cancelSvc).cancel(eq(APPT_ID), eq(USER_ID), any(), eq("changed-mind"), eq(2));
        verify(audit).append(eq("UPDATE"), eq("APPOINTMENT"), eq(APPT_ID.toString()), eq(USER_ID), eq("PATIENT"));

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(captor.capture());
        Object evt = captor.getValue();
        assertThat(evt).isInstanceOf(AppointmentCancelledDomainEvent.class);
        AppointmentCancelledDomainEvent cancelled = (AppointmentCancelledDomainEvent) evt;
        assertThat(cancelled.appointmentId()).isEqualTo(APPT_ID);
        assertThat(cancelled.patientId()).isEqualTo(PATIENT_ID);
    }

    // -----------------------------------------------------------------------
    // Test 6: cancel — cross-patient ownership check throws FORBIDDEN
    // -----------------------------------------------------------------------

    @Test
    void cancel_throws_forbidden_when_patient_does_not_own_appointment() {
        UUID otherPatientId = UUID.fromString("00000000-0000-0000-0000-000000000099");
        AppointmentModel a = AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, otherPatientId, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null);
        when(appts.findById(APPT_ID)).thenReturn(Optional.of(a));

        assertThatThrownBy(() -> svc.cancel(USER_ID, APPT_ID, "mine"))
            .isInstanceOf(BusinessException.class)
            .satisfies(ex -> assertThat(((BusinessException) ex).resultCode())
                .isEqualTo(ResultCode.FORBIDDEN));

        verify(cancelSvc, never()).cancel(any(), any(), any(), any(), anyInt());
    }
}
