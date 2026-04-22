package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.biz.patient.response.PatientVisitDetailResponse;
import my.cliniflow.controller.biz.patient.response.PatientVisitSummaryResponse;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.MedicalReportModel;
import my.cliniflow.domain.biz.visit.model.MedicationModel;
import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.MedicalReportRepository;
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
    private final MedicalReportRepository medicalReports;
    private final MedicationRepository meds;
    private final UserRepository users;

    public PatientReadAppService(
        PatientRepository patients,
        VisitRepository visits,
        PostVisitSummaryRepository summaries,
        MedicalReportRepository medicalReports,
        MedicationRepository meds,
        UserRepository users
    ) {
        this.patients = patients;
        this.visits = visits;
        this.summaries = summaries;
        this.medicalReports = medicalReports;
        this.meds = meds;
        this.users = users;
    }

    public List<PatientVisitSummaryResponse> listForUser(UUID userId) {
        PatientModel p = patients.findByUserId(userId).orElse(null);
        if (p == null) return List.of();
        return visits.findByPatientIdAndStatusOrderByFinalizedAtDesc(p.getId(), VisitStatus.FINALIZED).stream()
            .map(v -> {
                // Prefer medical_reports.summary_en (new path, written by post-visit
                // review refactor) and fall back to legacy post_visit_summaries for
                // visits finalized before the refactor.
                String summaryEn = medicalReports.findByVisitId(v.getId())
                    .map(MedicalReportModel::getSummaryEn)
                    .filter(s -> s != null && !s.isBlank())
                    .orElseGet(() -> summaries.findByVisitId(v.getId())
                        .map(PostVisitSummaryModel::getSummaryEn).orElse(""));
                int medCount = meds.findByVisitIdOrderByGmtCreateAsc(v.getId()).size();
                String preview = truncate(summaryEn, PREVIEW_LEN);
                String doctorName = null;
                if (v.getDoctorId() != null) {
                    UserModel doctor = users.findById(v.getDoctorId()).orElse(null);
                    if (doctor != null) {
                        doctorName = formatDoctorName(doctor.getFullName());
                    }
                }
                return new PatientVisitSummaryResponse(v.getId(), v.getFinalizedAt(), preview, medCount, doctorName);
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
        MedicalReportModel mr = medicalReports.findByVisitId(visitId).orElse(null);
        List<MedicationModel> ms = meds.findByVisitIdOrderByGmtCreateAsc(visitId);
        List<PatientVisitDetailResponse.Medication> medDtos = ms.stream()
            // TODO(post-visit-portal): wire duration/instructions from MedicationModel now that
            // PostVisitWriteAppService persists those fields. Replace the stubs below:
            //   duration    → m.getDurationDays() != null ? (m.getDurationDays() + " days") : ""
            //   NOTE: MedicationModel.durationDays is Integer; format as (durationDays + " days") when wiring.
            //   instructions → m.getInstructions() != null ? m.getInstructions() : ""
            //   NOTE: MedicationModel.instructions is String; pass directly.
            .map(m -> new PatientVisitDetailResponse.Medication(m.getName(), m.getDosage(), m.getFrequency(), "", ""))
            .toList();
        // TODO(post-visit-agent): populate redFlags / followUp from PostVisitSummaryModel
        // once the Post-Visit agent writes safety-net data. Requires:
        //   1. Manual SQL migration to add red_flags / follow_up_* columns (apply via Supabase SQL editor)
        //   2. Entity fields on PostVisitSummaryModel
        //   3. Agent payload writes (see agent/app/graphs/postvisit)
        // Until wired, frontend shows empty safety surfaces (by design — graceful stub).

        // Task 8.2: resolve the signing doctor's display name + initials so the
        // patient portal can render an attribution line under the summary card
        // (PRD §1.3, accountability surface). VisitModel.doctorId is already
        // populated by the Consultation workflow; we resolve it through the
        // existing UserRepository. If the doctor cannot be resolved (e.g. soft-
        // deleted user), we return nulls and the frontend hides the line.
        String doctorName = null;
        if (v.getDoctorId() != null) {
            UserModel doctor = users.findById(v.getDoctorId()).orElse(null);
            if (doctor != null) {
                doctorName = formatDoctorName(doctor.getFullName());
            }
        }

        // Prefer medical_reports summaries (new path); fall back to legacy
        // post_visit_summaries for pre-refactor visits.
        String summaryEn = (mr != null && mr.getSummaryEn() != null && !mr.getSummaryEn().isBlank())
            ? mr.getSummaryEn()
            : (s == null ? "" : s.getSummaryEn());
        String summaryMs = (mr != null && mr.getSummaryMs() != null && !mr.getSummaryMs().isBlank())
            ? mr.getSummaryMs()
            : (s == null ? "" : s.getSummaryMs());

        return new PatientVisitDetailResponse(
            v.getId(),
            v.getFinalizedAt(),
            summaryEn,
            summaryMs,
            medDtos,
            List.of(),
            null,
            doctorName
        );
    }

    private static String truncate(String s, int n) {
        if (s == null) return "";
        return s.length() <= n ? s : s.substring(0, n) + "\u2026";
    }

    /**
     * Render a doctor's display name as "Dr. {fullName}". If the stored name
     * already begins with "Dr." (case-insensitive, optional period/space) we
     * don't double-prefix. Returns null for blank input so the frontend hides
     * the attribution line gracefully.
     */
    private static String formatDoctorName(String fullName) {
        if (fullName == null) return null;
        String trimmed = fullName.trim();
        if (trimmed.isEmpty()) return null;
        String lower = trimmed.toLowerCase();
        if (lower.startsWith("dr. ") || lower.startsWith("dr ") || lower.equals("dr") || lower.equals("dr.")) return trimmed;
        return "Dr. " + trimmed;
    }

}
