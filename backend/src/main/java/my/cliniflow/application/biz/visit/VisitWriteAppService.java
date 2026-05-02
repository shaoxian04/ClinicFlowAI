package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.biz.visit.converter.EvaluatorFindingModel2DTOConverter;
import my.cliniflow.controller.biz.visit.response.EvaluatorFindingDTO;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.event.EvaluatorFindingAcknowledgedDomainEvent;
import my.cliniflow.domain.biz.visit.info.AcknowledgeFindingInfo;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.EvaluatorFindingRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.domain.biz.visit.service.EvaluatorFindingAcknowledgeDomainService;
import my.cliniflow.domain.biz.visit.service.ReferenceNumberDomainService;
import my.cliniflow.infrastructure.audit.AuditWriter;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Application service for visit-write operations not covered by the existing
 * {@link PreVisitWriteAppService}. Exposes the follow-up visit factory used by
 * appointment booking, plus evaluator finding acknowledge and re-evaluate flows.
 */
@Service
public class VisitWriteAppService {

    private final VisitRepository visits;
    private final UUID seededDoctorId;
    private final EvaluatorFindingRepository findingRepo;
    private final EvaluatorFindingModel2DTOConverter findingConverter;
    private final EvaluatorFindingAcknowledgeDomainService ackService;
    private final AuditWriter auditWriter;
    private final AgentServiceClient agent;
    private final ApplicationEventPublisher events;
    private final ReferenceNumberDomainService refNumbers;

    public VisitWriteAppService(VisitRepository visits,
                                @Value("${cliniflow.dev.seeded-doctor-id}") String seededDoctorId,
                                EvaluatorFindingRepository findingRepo,
                                EvaluatorFindingModel2DTOConverter findingConverter,
                                EvaluatorFindingAcknowledgeDomainService ackService,
                                AuditWriter auditWriter,
                                AgentServiceClient agent,
                                ApplicationEventPublisher events,
                                ReferenceNumberDomainService refNumbers) {
        this.visits = visits;
        this.seededDoctorId = UUID.fromString(seededDoctorId);
        this.findingRepo = findingRepo;
        this.findingConverter = findingConverter;
        this.ackService = ackService;
        this.auditWriter = auditWriter;
        this.agent = agent;
        this.events = events;
        this.refNumbers = refNumbers;
    }

    /**
     * Opens a fresh Visit row for a follow-up appointment.
     *
     * <p>Follow-ups deliberately bypass pre-visit symptom intake — the patient
     * already had that conversation with the doctor on the parent visit. The
     * {@code parent_visit_id} link is stored on the appointment, not on the
     * visit, so this method is parent-visit-agnostic.
     */
    @Transactional
    public UUID openFollowUpVisit(UUID patientId, UUID parentVisitId) {
        VisitModel v = new VisitModel();
        v.setPatientId(patientId);
        v.setDoctorId(seededDoctorId);
        v.setStatus(VisitStatus.IN_PROGRESS);
        v.setStartedAt(OffsetDateTime.now());
        if (v.getReferenceNumber() == null) {
            v.setReferenceNumber(refNumbers.nextFor(LocalDate.now()));
        }
        v = visits.save(v);
        return v.getId();
    }

    @Transactional
    public EvaluatorFindingDTO acknowledgeFinding(UUID visitId, UUID findingId, String reason, UUID doctorId) {
        VisitModel visit = visits.findById(visitId).orElseThrow(
            () -> new ResourceNotFoundException("visit not found: " + visitId));
        if (!visit.getDoctorId().equals(doctorId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "not your visit");
        }
        AcknowledgeFindingInfo info = new AcknowledgeFindingInfo(findingId, doctorId, reason);
        EvaluatorFindingModel ack = ackService.acknowledge(visitId, info);
        auditWriter.append("UPDATE", "evaluator_finding_ack", findingId.toString(), doctorId, "DOCTOR");
        events.publishEvent(new EvaluatorFindingAcknowledgedDomainEvent(
            visitId, findingId, doctorId, reason, OffsetDateTime.now()));
        return findingConverter.convert(ack);
    }

    public List<EvaluatorFindingDTO> reEvaluate(UUID visitId, UUID doctorId) {
        VisitModel visit = visits.findById(visitId).orElseThrow(
            () -> new ResourceNotFoundException("visit not found: " + visitId));
        if (!visit.getDoctorId().equals(doctorId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "not your visit");
        }
        auditWriter.append("READ", "evaluator_reevaluate", visitId.toString(), doctorId, "DOCTOR");
        agent.reEvaluate(visitId, visit.getPatientId(), doctorId);
        return findingRepo.findActiveByVisitId(visitId).stream()
            .map(findingConverter::convert)
            .toList();
    }
}
