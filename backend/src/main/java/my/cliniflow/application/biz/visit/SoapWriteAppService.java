package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@Service
public class SoapWriteAppService {

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final AgentServiceClient agent;

    public SoapWriteAppService(VisitRepository visits, MedicalReportRepository reports, AgentServiceClient agent) {
        this.visits = visits;
        this.reports = reports;
        this.agent = agent;
    }

    @Transactional
    public MedicalReportModel generateDraft(UUID visitId, String transcript) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        if (v.getStatus() == VisitStatus.FINALIZED) {
            throw new IllegalStateException("visit already finalized: " + visitId);
        }
        PreVisitReportModel pv = v.getPreVisitReport();
        Map<String, Object> preVisitFields = pv == null ? Map.of()
            : extractFields(pv.getStructured());

        AgentServiceClient.SoapResult soap = agent.callVisitGenerate(visitId, preVisitFields, transcript);

        MedicalReportModel r = reports.findByVisitId(visitId).orElseGet(() -> {
            MedicalReportModel m = new MedicalReportModel();
            m.setVisitId(visitId);
            return m;
        });
        if (r.isFinalized()) throw new IllegalStateException("medical report already finalized");
        r.setSubjective(nz(soap.subjective()));
        r.setObjective(nz(soap.objective()));
        r.setAssessment(nz(soap.assessment()));
        r.setPlan(nz(soap.plan()));
        r.setAiDraftHash(sha256(nz(soap.subjective()) + "|" + nz(soap.objective()) + "|" + nz(soap.assessment()) + "|" + nz(soap.plan())));
        return reports.save(r);
    }

    @Transactional
    public MedicalReportModel saveDraft(UUID visitId, String subjective, String objective, String assessment, String plan) {
        MedicalReportModel r = reports.findByVisitId(visitId).orElseThrow(
            () -> new IllegalArgumentException("no draft for visit: " + visitId));
        if (r.isFinalized()) throw new IllegalStateException("medical report already finalized");
        r.setSubjective(subjective);
        r.setObjective(objective);
        r.setAssessment(assessment);
        r.setPlan(plan);
        return reports.save(r);
    }

    @Transactional
    public MedicalReportModel finalize(UUID visitId, UUID doctorUserId, String subjective, String objective, String assessment, String plan) {
        MedicalReportModel r = reports.findByVisitId(visitId).orElseThrow(
            () -> new IllegalArgumentException("no draft for visit: " + visitId));
        if (r.isFinalized()) return r;
        if (isBlank(subjective) || isBlank(objective) || isBlank(assessment) || isBlank(plan)) {
            throw new IllegalArgumentException("all 4 SOAP sections must be non-empty to finalize");
        }
        r.setSubjective(subjective);
        r.setObjective(objective);
        r.setAssessment(assessment);
        r.setPlan(plan);
        r.setFinalized(true);
        r.setFinalizedBy(doctorUserId);
        r.setFinalizedAt(OffsetDateTime.now());
        reports.save(r);

        VisitModel v = visits.findById(visitId).orElseThrow();
        v.setStatus(VisitStatus.FINALIZED);
        v.setFinalizedAt(OffsetDateTime.now());
        visits.save(v);
        return r;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> extractFields(Map<String, Object> structured) {
        Object fields = structured == null ? null : structured.get("fields");
        return fields instanceof Map ? (Map<String, Object>) fields : Map.of();
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }

    private static String nz(String s) { return s == null ? "" : s; }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
