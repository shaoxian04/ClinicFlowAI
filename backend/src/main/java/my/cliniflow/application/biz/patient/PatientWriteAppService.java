package my.cliniflow.application.biz.patient;

import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientClinicalProfileRepository;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import my.cliniflow.infrastructure.crypto.NationalIdEncryptor;
import my.cliniflow.infrastructure.outbox.Neo4jProjectionOperation;
import my.cliniflow.infrastructure.outbox.Neo4jProjectionOutboxWriter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PatientWriteAppService {

    private final UserRepository users;
    private final PatientRepository patients;
    private final PatientClinicalProfileRepository clinicalProfiles;
    private final UserWriteAppService userWrite;
    private final NationalIdEncryptor nidEncryptor;
    private final Neo4jProjectionOutboxWriter outbox;
    private final AuditWriter audit;
    private final JdbcTemplate jdbc;

    public PatientWriteAppService(UserRepository users,
                                   PatientRepository patients,
                                   PatientClinicalProfileRepository clinicalProfiles,
                                   UserWriteAppService userWrite,
                                   NationalIdEncryptor nidEncryptor,
                                   Neo4jProjectionOutboxWriter outbox,
                                   AuditWriter audit,
                                   JdbcTemplate jdbc) {
        this.users = users;
        this.patients = patients;
        this.clinicalProfiles = clinicalProfiles;
        this.userWrite = userWrite;
        this.nidEncryptor = nidEncryptor;
        this.outbox = outbox;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @Transactional
    public void recordConsent(UUID userId, OffsetDateTime timestamp) {
        UserModel user = users.findById(userId).orElseThrow(
            () -> new IllegalArgumentException("user not found: " + userId));
        jdbc.update(
            "INSERT INTO audit_log(occurred_at, actor_user_id, actor_role, action, resource_type, resource_id) VALUES (?,?,?,?,?,?)",
            timestamp, userId, user.getRole().name(), "CREATE", "CONSENT", userId.toString()
        );
    }

    /**
     * Register a new patient (self-service or staff-led).
     * Returns the patient row id. NRIC is encrypted + fingerprinted; duplicate
     * fingerprint throws ConflictException.
     */
    @Transactional
    public RegistrationResult register(RegistrationInput in,
                                        UUID actorUserId,
                                        String actorRole) {
        String fingerprint = null;
        if (in.nationalId() != null && !in.nationalId().isBlank()) {
            fingerprint = nidEncryptor.fingerprint(in.nationalId());
            if (patients.existsByNationalIdFingerprint(fingerprint)) {
                throw new ConflictException("national id already registered");
            }
        }

        UUID userId = null;
        if (in.createUserAccount()) {
            userId = userWrite.createPatientUser(
                in.email(),
                in.password(),
                in.fullName(),
                in.phone(),
                in.preferredLanguage());
        }

        PatientModel p = new PatientModel();
        p.setUserId(userId);
        p.setFullName(in.fullName());
        p.setDateOfBirth(in.dateOfBirth());
        p.setGender(in.gender());
        p.setPhone(in.phone());
        p.setEmail(in.email());
        p.setPreferredLanguage(in.preferredLanguage());
        p.setRegistrationSource(in.registrationSource() == null ? "STAFF_LED" : in.registrationSource());
        if (fingerprint != null) {
            p.setNationalIdCiphertext(nidEncryptor.encrypt(in.nationalId()));
            p.setNationalIdFingerprint(fingerprint);
        }
        if (in.consentVersion() != null) {
            p.setConsentGivenAt(OffsetDateTime.now());
            p.setConsentVersion(in.consentVersion());
        }
        patients.saveAndFlush(p);

        // Optional clinical baseline
        boolean baselineApplied = false;
        if (in.clinicalBaseline() != null && !in.clinicalBaseline().isEmpty()) {
            applyClinicalBaseline(p.getId(), in.clinicalBaseline(), "REGISTRATION");
            baselineApplied = true;
        }

        // Outbox enqueue for Neo4j projection — node first, then edges if a baseline was set.
        Map<String, Object> payload = new HashMap<>();
        payload.put("patientId", p.getId().toString());
        payload.put("fullName", p.getFullName());
        payload.put("gender", p.getGender());
        payload.put("dateOfBirth", p.getDateOfBirth() == null ? null : p.getDateOfBirth().toString());
        payload.put("preferredLanguage", p.getPreferredLanguage());
        outbox.enqueue(p.getId(), Neo4jProjectionOperation.PATIENT_UPSERT, payload);

        if (baselineApplied) {
            Map<String, Object> profilePayload = new HashMap<>();
            profilePayload.put("patientId", p.getId().toString());
            profilePayload.put("source", "REGISTRATION");
            outbox.enqueue(p.getId(), Neo4jProjectionOperation.PATIENT_PROFILE_UPSERT, profilePayload);
        }

        audit.append("CREATE", "PATIENT", p.getId().toString(),
                actorUserId, actorRole == null ? "PATIENT" : actorRole);

        return new RegistrationResult(p.getId(), userId);
    }

    @Transactional
    public void updateClinicalProfile(UUID patientId,
                                       Map<String, Object> patch,
                                       String source,
                                       UUID actorUserId,
                                       String actorRole) {
        if (!patients.existsById(patientId)) {
            throw new ResourceNotFoundException("PATIENT", patientId);
        }
        applyClinicalBaseline(patientId, patch, source);
        audit.append("UPDATE", "PATIENT_PROFILE", patientId.toString(), actorUserId, actorRole);

        Map<String, Object> payload = new HashMap<>();
        payload.put("patientId", patientId.toString());
        payload.put("source", source);
        payload.put("fields", patch.keySet());
        outbox.enqueue(patientId, Neo4jProjectionOperation.PATIENT_PROFILE_UPSERT, payload);
    }

    @SuppressWarnings("unchecked")
    private void applyClinicalBaseline(UUID patientId, Map<String, Object> input, String source) {
        PatientClinicalProfileModel prof = clinicalProfiles.findByPatientId(patientId)
                .orElseGet(() -> {
                    PatientClinicalProfileModel n = new PatientClinicalProfileModel();
                    n.setPatientId(patientId);
                    return n;
                });

        OffsetDateTime now = OffsetDateTime.now();

        if (input.containsKey("weightKg") && input.get("weightKg") != null) {
            prof.setWeightKg(toBigDecimal(input.get("weightKg")));
            prof.setWeightKgUpdatedAt(now);
            prof.setWeightKgSource(source);
        }
        if (input.containsKey("heightCm") && input.get("heightCm") != null) {
            prof.setHeightCm(toBigDecimal(input.get("heightCm")));
            prof.setHeightCmUpdatedAt(now);
            prof.setHeightCmSource(source);
        }
        if (input.containsKey("drugAllergies") && input.get("drugAllergies") != null) {
            prof.setDrugAllergies((List<Map<String, Object>>) input.get("drugAllergies"));
            prof.setDrugAllergiesUpdatedAt(now);
            prof.setDrugAllergiesSource(source);
        }
        if (input.containsKey("chronicConditions") && input.get("chronicConditions") != null) {
            prof.setChronicConditions((List<Map<String, Object>>) input.get("chronicConditions"));
            prof.setChronicConditionsUpdatedAt(now);
            prof.setChronicConditionsSource(source);
        }
        if (input.containsKey("regularMedications") && input.get("regularMedications") != null) {
            prof.setRegularMedications((List<Map<String, Object>>) input.get("regularMedications"));
            prof.setRegularMedicationsUpdatedAt(now);
            prof.setRegularMedicationsSource(source);
        }
        if (input.containsKey("pregnancyStatus") && input.get("pregnancyStatus") != null) {
            prof.setPregnancyStatus((String) input.get("pregnancyStatus"));
            prof.setPregnancyEdd(parseDate(input.get("pregnancyEdd")));
            prof.setPregnancyUpdatedAt(now);
            prof.setPregnancySource(source);
        }
        prof.setCompletenessState(computeCompleteness(prof));
        clinicalProfiles.save(prof);
    }

    private static BigDecimal toBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal bd) return bd;
        if (v instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        return new BigDecimal(v.toString());
    }

    private static java.time.LocalDate parseDate(Object v) {
        if (v == null) return null;
        if (v instanceof java.time.LocalDate d) return d;
        return java.time.LocalDate.parse(v.toString());
    }

    private static String computeCompleteness(PatientClinicalProfileModel p) {
        int filled = 0;
        if (p.getWeightKg() != null) filled++;
        if (p.getHeightCm() != null) filled++;
        if (p.getDrugAllergiesUpdatedAt() != null) filled++;
        if (p.getChronicConditionsUpdatedAt() != null) filled++;
        if (p.getRegularMedicationsUpdatedAt() != null) filled++;
        if (filled == 0) return "INCOMPLETE";
        if (filled >= 5 && p.getDrugAllergiesUpdatedAt() != null) return "COMPLETE";
        return "PARTIAL";
    }

    /** Input for registration. Built by controller from request DTO. */
    public record RegistrationInput(
        String fullName,
        java.time.LocalDate dateOfBirth,
        String gender,
        String phone,
        String email,
        String preferredLanguage,
        String nationalId,
        String registrationSource,
        String consentVersion,
        boolean createUserAccount,
        String password,
        Map<String, Object> clinicalBaseline
    ) {}

    public record RegistrationResult(UUID patientId, UUID userId) {}
}
