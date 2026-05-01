package my.cliniflow.application.biz.schedule;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.visit.VisitReadAppService;
import my.cliniflow.application.biz.visit.VisitWriteAppService;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.biz.schedule.request.AppointmentBookRequest;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.event.AppointmentBookedDomainEvent;
import my.cliniflow.domain.biz.schedule.event.AppointmentCancelledDomainEvent;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import my.cliniflow.domain.biz.schedule.service.AppointmentBookDomainService;
import my.cliniflow.domain.biz.schedule.service.AppointmentCancelDomainService;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Orchestrates appointment booking + cancellation: derives identity from the
 * authenticated user, validates ownership on visit refs, calls the domain
 * services, writes audit rows, and publishes domain events.
 */
@Service
public class AppointmentWriteAppService {

    private static final short DEFAULT_CANCEL_LEAD_HOURS = 2;

    private final AppointmentBookDomainService bookSvc;
    private final AppointmentCancelDomainService cancelSvc;
    private final AppointmentRepository appts;
    private final AppointmentSlotRepository slotRepo;
    private final ScheduleTemplateRepository templates;
    private final PatientReadAppService patientReads;
    private final VisitReadAppService visitReads;
    private final VisitWriteAppService visits;
    private final UserRepository users;
    private final AuditWriter audit;
    private final ApplicationEventPublisher events;

    public AppointmentWriteAppService(
            AppointmentBookDomainService bookSvc,
            AppointmentCancelDomainService cancelSvc,
            AppointmentRepository appts,
            AppointmentSlotRepository slotRepo,
            ScheduleTemplateRepository templates,
            PatientReadAppService patientReads,
            VisitReadAppService visitReads,
            VisitWriteAppService visits,
            UserRepository users,
            AuditWriter audit,
            ApplicationEventPublisher events) {
        this.bookSvc = bookSvc;
        this.cancelSvc = cancelSvc;
        this.appts = appts;
        this.slotRepo = slotRepo;
        this.templates = templates;
        this.patientReads = patientReads;
        this.visitReads = visitReads;
        this.visits = visits;
        this.users = users;
        this.audit = audit;
        this.events = events;
    }

    @Transactional
    public UUID book(UUID userId, AppointmentBookRequest req) {
        UUID patientId = patientReads.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("patient profile not found: " + userId))
            .getId();
        AppointmentType type;
        try {
            type = AppointmentType.valueOf(req.type());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "invalid appointment type: " + req.type());
        }

        UUID visitId;
        if (type == AppointmentType.NEW_SYMPTOM) {
            if (req.visitId() == null) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "visitId required for NEW_SYMPTOM");
            }
            visitReads.assertOwnedBy(req.visitId(), patientId);
            visitId = req.visitId();
        } else {
            if (req.parentVisitId() == null) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "parentVisitId required for FOLLOW_UP");
            }
            visitReads.assertOwnedBy(req.parentVisitId(), patientId);
            visitId = visits.openFollowUpVisit(patientId, req.parentVisitId());
        }

        AppointmentModel a = bookSvc.book(req.slotId(), patientId, visitId, type, req.parentVisitId());
        String role = users.findById(userId).orElseThrow().getRole().name();
        audit.append("CREATE", "APPOINTMENT", a.getId().toString(), userId, role);
        events.publishEvent(new AppointmentBookedDomainEvent(a.getId(), patientId, a.getSlotId()));
        return a.getId();
    }

    @Transactional
    public void cancel(UUID userId, UUID appointmentId, String reason) {
        UUID patientId = patientReads.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("patient profile not found: " + userId))
            .getId();
        AppointmentModel a = appts.findById(appointmentId)
            .orElseThrow(() -> new ResourceNotFoundException("appointment not found: " + appointmentId));
        if (!a.getPatientId().equals(patientId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "cross-patient appointment cancel");
        }

        // Look up the slot to get the doctorId, then retrieve the cancel-lead policy from the template.
        UUID doctorId = slotRepo.findById(a.getSlotId()).orElseThrow().getDoctorId();
        short leadHours = templates.findCurrentForDoctor(doctorId)
            .map(tpl -> tpl.getCancelLeadHours())
            .orElse(DEFAULT_CANCEL_LEAD_HOURS);

        cancelSvc.cancel(appointmentId, userId, OffsetDateTime.now(), reason, leadHours);
        String role = users.findById(userId).orElseThrow().getRole().name();
        audit.append("UPDATE", "APPOINTMENT", appointmentId.toString(), userId, role);
        events.publishEvent(new AppointmentCancelledDomainEvent(appointmentId, patientId));
    }
}
