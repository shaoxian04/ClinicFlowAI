package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.biz.visit.converter.EvaluatorFindingModel2DTOConverter;
import my.cliniflow.controller.biz.visit.response.EvaluatorFindingDTO;
import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.controller.biz.visit.response.VisitSummaryResponse;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import my.cliniflow.domain.biz.visit.dto.PreVisitStructuredDto;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.EvaluatorFindingRepository;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class VisitReadAppService {

    private static final Logger log = LoggerFactory.getLogger(VisitReadAppService.class);

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final PatientRepository patients;
    private final ObjectMapper mapper;
    private final EvaluatorFindingRepository findingRepo;
    private final EvaluatorFindingModel2DTOConverter findingConverter;
    private final AuditWriter auditWriter;

    public VisitReadAppService(VisitRepository visits, MedicalReportRepository reports,
                               PatientRepository patients, ObjectMapper mapper,
                               EvaluatorFindingRepository findingRepo,
                               EvaluatorFindingModel2DTOConverter findingConverter,
                               AuditWriter auditWriter) {
        this.visits = visits;
        this.reports = reports;
        this.patients = patients;
        this.mapper = mapper;
        this.findingRepo = findingRepo;
        this.findingConverter = findingConverter;
        this.auditWriter = auditWriter;
    }

    public List<VisitSummaryResponse> listForDoctor(UUID doctorId) {
        return visits.findByDoctorIdOrderByGmtCreateDesc(doctorId).stream()
            .map(v -> toSummary(v, reports.findByVisitId(v.getId()).orElse(null)))
            .toList();
    }

    public record DoctorAndPatient(UUID doctorId, UUID patientId) {}

    public DoctorAndPatient findDoctorAndPatient(UUID visitId) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        return new DoctorAndPatient(v.getDoctorId(), v.getPatientId());
    }

    public VisitDetailResponse detail(UUID visitId) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        MedicalReportModel r = reports.findByVisitId(visitId).orElse(null);
        PreVisitReportModel pv = v.getPreVisitReport();
        Map<String, Object> rawStructured = pv == null ? null : pv.getStructured();
        // Convert snake_case jsonb (as agent wrote it) → camelCase DTO for the frontend.
        // @JsonAlias on PreVisitFieldsDto accepts snake_case input; Jackson writes
        // camelCase on serialization. See PreVisitFieldsDto javadoc.
        PreVisitStructuredDto structured;
        if (rawStructured == null || rawStructured.isEmpty()) {
            structured = new PreVisitStructuredDto(null, List.of(), false);
        } else {
            try {
                structured = mapper.convertValue(rawStructured, PreVisitStructuredDto.class);
            } catch (Exception e) {
                log.warn("[DETAIL] could not convert preVisitStructured visit={} err={}", visitId, e.toString());
                structured = new PreVisitStructuredDto(null, List.of(), false);
            }
        }
        String patientName = patients.findById(v.getPatientId()).map(PatientModel::getFullName).orElse("(unknown)");

        String previewApprovedAtStr = r != null && r.getPreviewApprovedAt() != null
            ? r.getPreviewApprovedAt().toString() : null;
        VisitDetailResponse.Soap soap = r == null
            ? new VisitDetailResponse.Soap("", "", "", "", false, null, null, null, null)
            : new VisitDetailResponse.Soap(
                r.getSubjective(), r.getObjective(), r.getAssessment(), r.getPlan(),
                r.isFinalized(), r.getAiDraftHash(),
                previewApprovedAtStr, r.getSummaryEn(), r.getSummaryMs());

        MedicalReportDto reportDraft = loadReportDraft(visitId);

        return new VisitDetailResponse(
            v.getId(), v.getPatientId(), patientName, v.getStatus(),
            structured, soap, v.getGmtCreate(), v.getFinalizedAt(), reportDraft
        );
    }

    private MedicalReportDto loadReportDraft(UUID visitId) {
        String json = visits.findReportDraftJson(visitId);
        if (json == null) return null;
        try {
            Map<String, Object> raw = mapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            return mapper.convertValue(raw, MedicalReportDto.class);
        } catch (Exception e) {
            log.warn("[DETAIL] could not parse report_draft visit={} err={}", visitId, e.toString());
            return null;
        }
    }

    @Transactional
    public List<EvaluatorFindingDTO> listFindings(UUID visitId, UUID requesterUserId, Role role) {
        VisitModel visit = visits.findById(visitId).orElseThrow(
            () -> new ResourceNotFoundException("visit not found: " + visitId));
        if (role == Role.DOCTOR && !visit.getDoctorId().equals(requesterUserId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "not your visit");
        }
        auditWriter.append("READ", "evaluator_finding", visitId.toString(), requesterUserId, role.name());
        return findingRepo.findActiveByVisitId(visitId).stream()
            .map(findingConverter::convert)
            .toList();
    }

    public void assertOwnedBy(UUID visitId, UUID patientId) {
        VisitModel v = visits.findById(visitId)
            .orElseThrow(() -> new ResourceNotFoundException("visit not found: " + visitId));
        if (!v.getPatientId().equals(patientId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "cross-patient visit access");
        }
    }

    private VisitSummaryResponse toSummary(VisitModel v, MedicalReportModel r) {
        PreVisitReportModel pv = v.getPreVisitReport();
        boolean preDone = pv != null && Boolean.TRUE.equals(pv.getStructured().get("done"));
        boolean soapFinalized = r != null && r.isFinalized();
        String patientName = patients.findById(v.getPatientId()).map(PatientModel::getFullName).orElse("(unknown)");
        return new VisitSummaryResponse(v.getId(), v.getPatientId(), patientName, v.getStatus(), preDone, soapFinalized, v.getGmtCreate());
    }
}
