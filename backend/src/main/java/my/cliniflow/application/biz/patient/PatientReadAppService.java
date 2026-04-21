package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.biz.patient.response.PatientVisitDetailResponse;
import my.cliniflow.controller.biz.patient.response.PatientVisitSummaryResponse;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicationRepository;
import my.cliniflow.domain.biz.visit.repository.PostVisitSummaryRepository;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class PatientReadAppService {

    private static final int PREVIEW_LEN = 160;

    private final PatientRepository patients;
    private final VisitRepository visits;
    private final PostVisitSummaryRepository summaries;
    private final MedicationRepository meds;

    public PatientReadAppService(
        PatientRepository patients,
        VisitRepository visits,
        PostVisitSummaryRepository summaries,
        MedicationRepository meds
    ) {
        this.patients = patients;
        this.visits = visits;
        this.summaries = summaries;
        this.meds = meds;
    }

    public List<PatientVisitSummaryResponse> listForUser(UUID userId) {
        PatientModel p = patients.findByUserId(userId).orElse(null);
        if (p == null) return List.of();
        return visits.findByPatientIdAndStatusOrderByFinalizedAtDesc(p.getId(), VisitStatus.FINALIZED).stream()
            .map(v -> {
                PostVisitSummaryModel s = summaries.findByVisitId(v.getId()).orElse(null);
                int medCount = meds.findByVisitIdOrderByGmtCreateAsc(v.getId()).size();
                String preview = s == null ? "" : truncate(s.getSummaryEn(), PREVIEW_LEN);
                return new PatientVisitSummaryResponse(v.getId(), v.getFinalizedAt(), preview, medCount);
            })
            .toList();
    }

    public PatientVisitDetailResponse detailForUser(UUID userId, UUID visitId) {
        PatientModel p = patients.findByUserId(userId).orElseThrow(
            () -> new IllegalArgumentException("no patient profile for user: " + userId));
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        if (!p.getId().equals(v.getPatientId())) {
            throw new IllegalArgumentException("visit does not belong to this patient");
        }
        if (v.getStatus() != VisitStatus.FINALIZED) {
            throw new IllegalStateException("visit is not finalized yet");
        }
        PostVisitSummaryModel s = summaries.findByVisitId(visitId).orElse(null);
        List<MedicationModel> ms = meds.findByVisitIdOrderByGmtCreateAsc(visitId);
        List<PatientVisitDetailResponse.Medication> medDtos = ms.stream()
            .map(m -> new PatientVisitDetailResponse.Medication(m.getName(), m.getDosage(), m.getFrequency()))
            .toList();
        // Task 8.1: redFlags/followUp are placeholders until the Post-Visit
        // agent populates them. Frontend gracefully no-ops on empty inputs.
        return new PatientVisitDetailResponse(
            v.getId(),
            v.getFinalizedAt(),
            s == null ? "" : s.getSummaryEn(),
            s == null ? "" : s.getSummaryMs(),
            medDtos,
            List.of(),
            null
        );
    }

    private static String truncate(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "\u2026";
    }
}
