package my.cliniflow.application.biz.schedule;

import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.user.repository.DoctorProfileRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Resolves human-readable names for patient/doctor ids to enrich
 * {@code AppointmentDTO}. Designed to be called from read paths only.
 *
 * <p>Doctor lookup chain: {@code doctors.id} (slot.doctor_id) →
 * {@code doctors.user_id} → {@code users.full_name}. Doctor names are
 * normalised to start with {@code "Dr. "} unless they already do.
 */
@Component
@Transactional(readOnly = true)
public class AppointmentNameResolver {

    private final PatientRepository patients;
    private final DoctorProfileRepository doctorProfiles;
    private final UserRepository users;

    public AppointmentNameResolver(PatientRepository patients,
                                    DoctorProfileRepository doctorProfiles,
                                    UserRepository users) {
        this.patients = patients;
        this.doctorProfiles = doctorProfiles;
        this.users = users;
    }

    public String patientName(UUID patientId) {
        if (patientId == null) return null;
        return patients.findById(patientId).map(p -> p.getFullName()).orElse(null);
    }

    public String doctorName(UUID doctorRowId) {
        if (doctorRowId == null) return null;
        return doctorProfiles.findById(doctorRowId)
            .map(dp -> users.findById(dp.getUserId()).map(u -> formatDoctorName(u.getFullName())).orElse(null))
            .orElse(null);
    }

    /** Batch helper — returns patientId → fullName map, useful for list endpoints. */
    public Map<UUID, String> patientNames(List<UUID> patientIds) {
        if (patientIds == null || patientIds.isEmpty()) return Map.of();
        Map<UUID, String> out = new HashMap<>();
        for (UUID id : patientIds.stream().distinct().collect(Collectors.toList())) {
            String n = patientName(id);
            if (n != null) out.put(id, n);
        }
        return out;
    }

    static String formatDoctorName(String fullName) {
        if (fullName == null) return null;
        String trimmed = fullName.trim();
        if (trimmed.isEmpty()) return null;
        String lower = trimmed.toLowerCase();
        if (lower.startsWith("dr. ") || lower.startsWith("dr ") || lower.equals("dr") || lower.equals("dr.")) return trimmed;
        return "Dr. " + trimmed;
    }
}
