package my.cliniflow.application.biz.visit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.biz.visit.response.ApproveResponse;
import my.cliniflow.controller.biz.visit.response.ChatTurnsResponse;
import my.cliniflow.controller.biz.visit.response.FinalizeResponse;
import my.cliniflow.controller.biz.visit.response.ReportReviewResult;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Post-visit review orchestration. One class for the 7 review endpoints so
 * the transaction boundaries and state transitions are all visible in one
 * place. See spec §3 (data model) and §5 (flow sequences).
 *
 * Audit-log strategy: there is NO DB-level trigger on medical_reports or visits
 * that writes to audit_log (only agent_turns has one, V7). The finalize method
 * performs an explicit INSERT into audit_log inside the same @Transactional
 * boundary, following the pattern established in PatientWriteAppService.
 * If finalize rolls back, the audit row rolls back with it.
 */
@Service
public class ReportReviewAppService {

    private static final Logger log = LoggerFactory.getLogger(ReportReviewAppService.class);

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final MedicationRepository meds;
    private final AgentServiceClient agent;
    private final ReportAggregatorService aggregator;
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;

    public ReportReviewAppService(
        VisitRepository visits,
        MedicalReportRepository reports,
        MedicationRepository meds,
        AgentServiceClient agent,
        ReportAggregatorService aggregator,
        ObjectMapper mapper,
        JdbcTemplate jdbc
    ) {
        this.visits = visits;
        this.reports = reports;
        this.meds = meds;
        this.agent = agent;
        this.aggregator = aggregator;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    // ───── /generate-sync ─────────────────────────────────────────────────────
    public ReportReviewResult generate(UUID visitId, String transcript, String specialty) {
        VisitModel v = requireVisit(visitId);
        if (v.getStatus() == VisitStatus.FINALIZED) throw new ConflictException("visit already finalized: " + visitId);
        log.info("[REVIEW] generate visit={} doctor={} patient={} transcriptLen={}",
            visitId, v.getDoctorId(), v.getPatientId(), transcript == null ? 0 : transcript.length());
        var stream = agent.reportGenerateStream(visitId, v.getPatientId(), v.getDoctorId(), specialty, transcript);
        return toResult(aggregator.aggregateSse(stream).block());
    }

    // ───── /clarify-sync ──────────────────────────────────────────────────────
    public ReportReviewResult clarify(UUID visitId, String answer) {
        VisitModel v = requireVisit(visitId);
        log.info("[REVIEW] clarify visit={} answerLen={}", visitId, answer == null ? 0 : answer.length());
        var stream = agent.reportClarifyStream(visitId, v.getPatientId(), v.getDoctorId(), answer);
        return toResult(aggregator.aggregateSse(stream).block());
    }

    // ───── /edit-sync ─────────────────────────────────────────────────────────
    public ReportReviewResult edit(UUID visitId, String instruction) {
        VisitModel v = requireVisit(visitId);
        // D1a bootstrap — fetch current draft from visits.report_draft jsonb,
        // pass to agent so LLM sees doctor's silent form-row edits.
        Object currentDraft = readCurrentDraft(visitId);
        log.info("[REVIEW] edit visit={} instructionLen={} hasDraft={}",
            visitId, instruction == null ? 0 : instruction.length(), currentDraft != null);
        var stream = agent.reportEditStream(visitId, v.getPatientId(), v.getDoctorId(), instruction, currentDraft);
        ReportAggregatorService.AggregateResult agg = aggregator.aggregateSse(stream).block();

        // Fallback: if the agent didn't emit update_soap_draft (e.g. trivial
        // no-op edit), return the pre-edit draft so the UI never goes blank.
        if (agg != null && agg.report() == null && currentDraft != null) {
            MedicalReportDto fallback = mapper.convertValue(currentDraft, MedicalReportDto.class);
            log.info("[REVIEW] edit no-op — returning pre-edit draft visit={}", visitId);
            return new ReportReviewResult(agg.status(), fallback, toCl(agg.clarification()));
        }
        return toResult(agg);
    }

    // ───── PATCH /report/draft ────────────────────────────────────────────────
    @Transactional
    public MedicalReportDto patchDraft(UUID visitId, String path, Object value) {
        log.info("[REVIEW] patchDraft visit={} path={}", visitId, path);
        String[] jsonPath = toJsonPath(path);
        String pathLiteral = "{" + String.join(",", jsonPath) + "}";
        String valueJson;
        try { valueJson = mapper.writeValueAsString(value); }
        catch (Exception e) { throw new IllegalArgumentException("invalid value for patchDraft: " + e.getMessage()); }
        visits.patchReportDraftJsonb(visitId, pathLiteral, valueJson);
        return mapper.convertValue(readCurrentDraft(visitId), MedicalReportDto.class);
    }

    // ───── GET /report/chat ───────────────────────────────────────────────────
    public ChatTurnsResponse getChat(UUID visitId) {
        log.info("[REVIEW] getChat visit={}", visitId);
        var fromAgent = agent.getReportChat(visitId);
        List<ChatTurnsResponse.ChatTurn> mapped = fromAgent.turns().stream()
            .map(t -> new ChatTurnsResponse.ChatTurn(t.turnIndex(), t.role(), t.content(), t.toolCallName(), t.createdAt()))
            .toList();
        log.info("[REVIEW] getChat returned visit={} turns={}", visitId, mapped.size());
        return new ChatTurnsResponse(mapped);
    }

    // ───── POST /report/approve ───────────────────────────────────────────────
    @Transactional
    public ApproveResponse approve(UUID visitId) {
        // Require that the agent has actually written a draft. medical_reports
        // may or may not have a row yet — we create it here if missing, using
        // the flat-text flattening of the jsonb draft. Without a jsonb draft,
        // there's nothing to approve (genuine precondition violation).
        Map<String, Object> draft = readCurrentDraft(visitId);
        if (draft == null) {
            log.info("[REVIEW] approve rejected — no report_draft visit={}", visitId);
            throw new ConflictException("no report draft to approve — generate the report first");
        }
        MedicalReportDto dto = mapper.convertValue(draft, MedicalReportDto.class);

        MedicalReportModel r = reports.findByVisitId(visitId).orElseGet(() -> {
            MedicalReportModel m = new MedicalReportModel();
            m.setVisitId(visitId);
            return m;
        });
        if (r.isFinalized()) throw new ConflictException("report already finalized");

        // Flatten the current draft into the text columns so the row is
        // useful even before finalize (portal reads fall back gracefully).
        r.setSubjective(flattenSubjective(dto));
        r.setObjective(flattenObjective(dto));
        r.setAssessment(flattenAssessment(dto));
        r.setPlan(flattenPlan(dto));

        OffsetDateTime now = OffsetDateTime.now();
        r.setPreviewApprovedAt(now);
        reports.save(r);
        log.info("[REVIEW] approve visit={} at={}", visitId, now);
        return new ApproveResponse(true, now);
    }

    // ───── POST /report/finalize ──────────────────────────────────────────────
    @Transactional
    public FinalizeResponse finalize(UUID visitId, UUID doctorId) {
        MedicalReportModel r = reports.findByVisitId(visitId)
            .orElseThrow(() -> new ResourceNotFoundException("medical report for visit", visitId));
        if (r.isFinalized()) {
            log.info("[REVIEW] finalize idempotent — already finalized visit={}", visitId);
            return new FinalizeResponse(visitId, r.getSummaryEn(), r.getSummaryMs(), r.getFinalizedAt());
        }
        if (r.getPreviewApprovedAt() == null) {
            log.info("[REVIEW] finalize gate failed — not approved visit={}", visitId);
            throw new ConflictException("preview must be approved before finalizing");
        }

        // Delegate to agent for validation + summary. Agent no longer touches visits.
        Map<String, Object> finalized = agent.reportFinalize(visitId);
        String summaryEn = (String) finalized.getOrDefault("summary_en", "");
        String summaryMs = (String) finalized.getOrDefault("summary_ms", "");
        @SuppressWarnings("unchecked")
        Map<String, Object> reportJson = (Map<String, Object>) finalized.get("report");
        MedicalReportDto finalizedReport = mapper.convertValue(reportJson, MedicalReportDto.class);

        // Flatten the structured report into the flat text columns
        r.setSubjective(flattenSubjective(finalizedReport));
        r.setObjective(flattenObjective(finalizedReport));
        r.setAssessment(flattenAssessment(finalizedReport));
        r.setPlan(flattenPlan(finalizedReport));
        r.setSummaryEn(summaryEn);
        r.setSummaryMs(summaryMs);
        r.setFinalized(true);
        r.setFinalizedBy(doctorId);
        OffsetDateTime now = OffsetDateTime.now();
        r.setFinalizedAt(now);
        r.setAiDraftHash(sha256(r.getSubjective() + "|" + r.getObjective() + "|" + r.getAssessment() + "|" + r.getPlan()));
        reports.save(r);

        // Write medications extracted from the finalized report to the
        // medications table so the patient portal can display them.
        if (finalizedReport.plan() != null && finalizedReport.plan().medications() != null) {
            meds.deleteByVisitId(visitId);
            for (var med : finalizedReport.plan().medications()) {
                if (med == null || med.drugName() == null || med.drugName().isBlank()) continue;
                MedicationModel m = new MedicationModel();
                m.setVisitId(visitId);
                m.setName(med.drugName().trim());
                m.setDosage(med.dose() == null ? "" : med.dose().trim());
                m.setFrequency(med.frequency() == null ? "" : med.frequency().trim());
                if (med.duration() != null && !med.duration().isBlank()) {
                    String digits = med.duration().replaceAll("[^0-9]", "");
                    if (!digits.isEmpty()) {
                        try { m.setDurationDays(Integer.parseInt(digits)); } catch (NumberFormatException ignored) {}
                    }
                }
                meds.save(m);
            }
            log.info("[REVIEW] saved {} medication(s) for visit={}", finalizedReport.plan().medications().size(), visitId);
        }

        VisitModel v = visits.findById(visitId).orElseThrow();
        v.setStatus(VisitStatus.FINALIZED);
        v.setFinalizedAt(now);
        visits.save(v);

        // PDPA audit: explicit INSERT — no DB trigger covers medical_reports (V1 schema).
        // Runs inside the same @Transactional; rolls back if anything above fails.
        //
        // action='UPDATE' — closest legal value per audit_log CHECK constraint;
        // the actual event type is in metadata.event='finalized'. Don't change
        // this to 'CREATE' — it would be equally wrong and confuse audit queries.
        String correlationId = MDC.get("correlationId");
        if (correlationId == null || correlationId.isEmpty()) {
            correlationId = UUID.randomUUID().toString();
        }
        jdbc.update(
            "INSERT INTO audit_log(occurred_at, actor_user_id, actor_role, action, resource_type, resource_id, correlation_id, metadata) "
            + "VALUES (?,?,?,?,?,?,?,?::jsonb)",
            now, doctorId, "DOCTOR", "UPDATE", "medical_reports", visitId.toString(),
            correlationId, "{\"event\":\"finalized\",\"visit_id\":\"" + visitId + "\"}"
        );

        log.info("[REVIEW] finalize OK visit={} doctor={} summaryEnLen={} summaryMsLen={}",
            visitId, doctorId, summaryEn.length(), summaryMs.length());

        return new FinalizeResponse(visitId, summaryEn, summaryMs, now);
    }

    // ───── helpers ────────────────────────────────────────────────────────────
    private VisitModel requireVisit(UUID visitId) {
        return visits.findById(visitId).orElseThrow(() -> new ResourceNotFoundException("visit", visitId));
    }

    private Map<String, Object> readCurrentDraft(UUID visitId) {
        String json = visits.findReportDraftJson(visitId);
        if (json == null) return null;
        try { return mapper.readValue(json, new TypeReference<Map<String, Object>>() {}); }
        catch (Exception e) { log.warn("[REVIEW] failed to parse report_draft visit={} err={}", visitId, e.toString()); return null; }
    }

    private static String[] toJsonPath(String dotted) {
        // "plan.medications[0].dose" → ["plan", "medications", "0", "dose"]
        return dotted.replaceAll("\\[(\\d+)\\]", ".$1").split("\\.");
    }

    private ReportReviewResult toResult(ReportAggregatorService.AggregateResult agg) {
        if (agg == null) return new ReportReviewResult("error", null, null);
        return new ReportReviewResult(agg.status(), agg.report(), toCl(agg.clarification()));
    }

    private ReportReviewResult.Clarification toCl(ReportAggregatorService.Clarification c) {
        return c == null ? null : new ReportReviewResult.Clarification(c.field(), c.prompt(), c.context());
    }

    private static String flattenSubjective(MedicalReportDto r) {
        var s = r.subjective();
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        if (s.chiefComplaint() != null) sb.append("Chief complaint: ").append(s.chiefComplaint()).append("\n");
        if (s.historyOfPresentIllness() != null) sb.append(s.historyOfPresentIllness()).append("\n");
        if (s.symptomDuration() != null) sb.append("Duration: ").append(s.symptomDuration()).append("\n");
        if (s.associatedSymptoms() != null && !s.associatedSymptoms().isEmpty())
            sb.append("Associated: ").append(String.join(", ", s.associatedSymptoms())).append("\n");
        return sb.toString().trim();
    }

    private static String flattenObjective(MedicalReportDto r) {
        var o = r.objective();
        if (o == null) return "";
        StringBuilder sb = new StringBuilder();
        if (o.vitalSigns() != null) o.vitalSigns().forEach((k, val) -> sb.append(k).append(": ").append(val).append("\n"));
        if (o.physicalExam() != null) sb.append(o.physicalExam());
        return sb.toString().trim();
    }

    private static String flattenAssessment(MedicalReportDto r) {
        var a = r.assessment();
        if (a == null) return "";
        StringBuilder sb = new StringBuilder();
        if (a.primaryDiagnosis() != null) sb.append("Primary: ").append(a.primaryDiagnosis()).append("\n");
        if (a.differentialDiagnoses() != null && !a.differentialDiagnoses().isEmpty())
            sb.append("Differentials: ").append(String.join(", ", a.differentialDiagnoses())).append("\n");
        if (a.icd10Codes() != null && !a.icd10Codes().isEmpty())
            sb.append("ICD-10: ").append(String.join(", ", a.icd10Codes())).append("\n");
        return sb.toString().trim();
    }

    private static String flattenPlan(MedicalReportDto r) {
        var p = r.plan();
        if (p == null) return "";
        StringBuilder sb = new StringBuilder();
        if (p.medications() != null) for (var m : p.medications()) {
            if (m == null) continue;
            String name = m.drugName();
            if (name == null || name.isBlank()) continue;  // skip empty med slots
            sb.append(name);
            if (m.dose() != null && !m.dose().isBlank()) sb.append(" ").append(m.dose());
            if (m.frequency() != null && !m.frequency().isBlank()) sb.append(" ").append(m.frequency());
            if (m.duration() != null && !m.duration().isBlank()) sb.append(" for ").append(m.duration());
            sb.append("\n");
        }
        if (p.investigations() != null && !p.investigations().isEmpty())
            sb.append("Investigations: ").append(String.join(", ", p.investigations())).append("\n");
        if (p.lifestyleAdvice() != null && !p.lifestyleAdvice().isEmpty())
            sb.append("Lifestyle: ").append(String.join(", ", p.lifestyleAdvice())).append("\n");
        if (p.followUp() != null && p.followUp().needed()) {
            sb.append("Follow-up");
            if (p.followUp().timeframe() != null) sb.append(" in ").append(p.followUp().timeframe());
            sb.append("\n");
        }
        if (p.redFlags() != null && !p.redFlags().isEmpty())
            sb.append("Red flags: ").append(String.join("; ", p.redFlags())).append("\n");
        return sb.toString().trim();
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
