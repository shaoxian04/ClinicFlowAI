package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.controller.biz.visit.response.VisitSummaryResponse;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class VisitReadAppService {

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final PatientRepository patients;

    public VisitReadAppService(VisitRepository visits, MedicalReportRepository reports, PatientRepository patients) {
        this.visits = visits;
        this.reports = reports;
        this.patients = patients;
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
        Map<String, Object> structured = pv == null ? Map.of() : pv.getStructured();
        String patientName = patients.findById(v.getPatientId()).map(PatientModel::getFullName).orElse("(unknown)");
        VisitDetailResponse.Soap soap = r == null
            ? new VisitDetailResponse.Soap("", "", "", "", false, null)
            : new VisitDetailResponse.Soap(r.getSubjective(), r.getObjective(), r.getAssessment(), r.getPlan(), r.isFinalized(), r.getAiDraftHash());
        return new VisitDetailResponse(
            v.getId(), v.getPatientId(), patientName, v.getStatus(),
            structured, soap, v.getGmtCreate(), v.getFinalizedAt()
        );
    }

    private VisitSummaryResponse toSummary(VisitModel v, MedicalReportModel r) {
        PreVisitReportModel pv = v.getPreVisitReport();
        boolean preDone = pv != null && Boolean.TRUE.equals(pv.getStructured().get("done"));
        boolean soapFinalized = r != null && r.isFinalized();
        String patientName = patients.findById(v.getPatientId()).map(PatientModel::getFullName).orElse("(unknown)");
        return new VisitSummaryResponse(v.getId(), v.getPatientId(), patientName, v.getStatus(), preDone, soapFinalized, v.getGmtCreate());
    }
}
