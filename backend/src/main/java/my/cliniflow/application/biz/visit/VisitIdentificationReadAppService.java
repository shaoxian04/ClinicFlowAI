package my.cliniflow.application.biz.visit;

import my.cliniflow.application.biz.clinic.ClinicReadAppService;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.DoctorProfileRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Period;
import java.util.UUID;

/**
 * Assembles the combined identification block — clinic, patient, doctor, visit —
 * used by the Doctor Report Preview and the patient e-prescription modal.
 */
@Service
@Transactional(readOnly = true)
public class VisitIdentificationReadAppService {

    private final VisitRepository visits;
    private final PatientReadAppService patients;
    private final UserRepository users;
    private final DoctorProfileRepository doctorProfiles;
    private final ClinicReadAppService clinic;

    public VisitIdentificationReadAppService(
            VisitRepository visits,
            PatientReadAppService patients,
            UserRepository users,
            DoctorProfileRepository doctorProfiles,
            ClinicReadAppService clinic) {
        this.visits = visits;
        this.patients = patients;
        this.users = users;
        this.doctorProfiles = doctorProfiles;
        this.clinic = clinic;
    }

    public VisitIdentificationInfo assemble(UUID visitId) {
        VisitModel v = visits.findById(visitId)
                .orElseThrow(() -> new ResourceNotFoundException("Visit", visitId));

        PatientModel p = patients.findById(v.getPatientId())
                .orElseThrow(() -> new ResourceNotFoundException("Patient for visit", visitId));

        UserModel u = users.findById(v.getDoctorId())
                .orElseThrow(() -> new ResourceNotFoundException("Doctor for visit", visitId));

        DoctorProfileModel dp = doctorProfiles.findByUserId(v.getDoctorId())
                .orElseThrow(() -> new ResourceNotFoundException("Doctor profile for visit", visitId));

        String nationalId = patients.decryptNationalId(p);

        int ageYears = (p.getDateOfBirth() == null) ? 0
                : Period.between(p.getDateOfBirth(), LocalDate.now()).getYears();

        return new VisitIdentificationInfo(
                clinic.get(),
                new VisitIdentificationInfo.Patient(
                        p.getFullName(),
                        nationalId,
                        p.getDateOfBirth(),
                        ageYears,
                        p.getGender(),
                        p.getPhone()),
                new VisitIdentificationInfo.Doctor(
                        formatDoctorName(u.getFullName()),
                        dp.getMmcNumber(),
                        dp.getSpecialty()),
                new VisitIdentificationInfo.Visit(
                        v.getId(),
                        v.getPatientId(),
                        v.getReferenceNumber(),
                        v.getGmtCreate().toLocalDate(),
                        v.getFinalizedAt())
        );
    }

    private static String formatDoctorName(String name) {
        if (name == null) return "Dr. Unknown";
        String t = name.trim();
        if (t.isEmpty()) return "Dr. Unknown";
        String lower = t.toLowerCase();
        if (lower.startsWith("dr. ") || lower.startsWith("dr ") || lower.equals("dr") || lower.equals("dr.")) {
            return t;
        }
        return "Dr. " + t;
    }
}
