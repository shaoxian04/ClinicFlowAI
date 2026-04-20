package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.PostVisitSummaryRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class PostVisitWriteAppService {

    public record MedicationInput(String name, String dosage, String frequency) {}

    public record PostVisitResult(
        PostVisitSummaryModel summary,
        List<MedicationModel> medications
    ) {}

    private final VisitRepository visits;
    private final MedicalReportRepository reports;
    private final MedicationRepository meds;
    private final PostVisitSummaryRepository summaries;
    private final AgentServiceClient agent;

    public PostVisitWriteAppService(
        VisitRepository visits,
        MedicalReportRepository reports,
        MedicationRepository meds,
        PostVisitSummaryRepository summaries,
        AgentServiceClient agent
    ) {
        this.visits = visits;
        this.reports = reports;
        this.meds = meds;
        this.summaries = summaries;
        this.agent = agent;
    }

    @Transactional
    public PostVisitResult generate(UUID visitId, List<MedicationInput> medInputs) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        if (v.getStatus() != VisitStatus.FINALIZED) {
            throw new IllegalStateException("visit must be FINALIZED before post-visit generation: " + visitId);
        }
        MedicalReportModel report = reports.findByVisitId(visitId).orElseThrow(
            () -> new IllegalArgumentException("no medical report for visit: " + visitId));
        if (!report.isFinalized()) {
            throw new IllegalStateException("medical report must be finalized: " + visitId);
        }
        if (medInputs != null && medInputs.size() > 3) {
            throw new IllegalArgumentException("max 3 medications allowed, got " + medInputs.size());
        }

        // Replace-all medications for this visit.
        meds.deleteByVisitId(visitId);
        List<MedicationModel> saved = new ArrayList<>();
        if (medInputs != null) {
            for (MedicationInput in : medInputs) {
                if (in.name() == null || in.name().isBlank()) continue;
                MedicationModel m = new MedicationModel();
                m.setVisitId(visitId);
                m.setName(in.name().trim());
                m.setDosage(in.dosage() == null ? "" : in.dosage().trim());
                m.setFrequency(in.frequency() == null ? "" : in.frequency().trim());
                saved.add(meds.save(m));
            }
        }

        List<AgentServiceClient.MedicationView> medViews = saved.stream()
            .map(m -> new AgentServiceClient.MedicationView(m.getName(), m.getDosage(), m.getFrequency()))
            .toList();

        AgentServiceClient.PostVisitResult agentOut = agent.callPostVisitSummarize(
            visitId,
            report.getSubjective(), report.getObjective(),
            report.getAssessment(), report.getPlan(),
            medViews
        );

        PostVisitSummaryModel summary = summaries.findByVisitId(visitId).orElseGet(() -> {
            PostVisitSummaryModel s = new PostVisitSummaryModel();
            s.setVisitId(visitId);
            return s;
        });
        summary.setSummaryEn(agentOut.summaryEn());
        summary.setSummaryMs(agentOut.summaryMs());
        summary = summaries.save(summary);

        return new PostVisitResult(summary, saved);
    }
}
