package my.cliniflow.controller.biz.patient;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.patient.PatientWriteAppService;
import my.cliniflow.application.biz.patient.PatientWriteAppService.RegistrationInput;
import my.cliniflow.application.biz.patient.PatientWriteAppService.RegistrationResult;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.auth.request.StaffCreatePatientRequest;
import my.cliniflow.controller.biz.patient.response.PatientSummaryDTO;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/patients")
public class PatientsController {

    private final PatientReadAppService reads;
    private final PatientWriteAppService writes;

    public PatientsController(PatientReadAppService reads, PatientWriteAppService writes) {
        this.reads = reads;
        this.writes = writes;
    }

    /** Staff-led patient creation. */
    @PostMapping
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN')")
    public WebResult<Map<String, Object>> create(@Valid @RequestBody StaffCreatePatientRequest req,
                                                  Authentication auth) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
        boolean createUserAccount = req.createUserAccount() != null && req.createUserAccount();
        // Staff-led path: do not create a user account by default. If they want one,
        // generate a random temp password (admin or staff can hand it out separately).
        String tempPassword = createUserAccount ? randomPassword() : null;

        RegistrationInput input = new RegistrationInput(
                req.fullName(),
                req.dateOfBirth(),
                req.gender(),
                req.phone(),
                req.email(),
                req.preferredLanguage() == null ? "en" : req.preferredLanguage(),
                req.nationalId(),
                "STAFF_LED",
                null,            // staff-led has no consentVersion captured here
                createUserAccount,
                tempPassword,
                req.clinicalBaseline()
        );
        RegistrationResult result = writes.register(input, claims.userId(), claims.role().name());
        Map<String, Object> body = new HashMap<>();
        body.put("patientId", result.patientId().toString());
        if (result.userId() != null) body.put("userId", result.userId().toString());
        if (createUserAccount) body.put("tempPassword", tempPassword);
        return WebResult.ok(body);
    }

    /** Patient search by national-id OR fullName (typeahead). */
    @GetMapping("/search")
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN')")
    public WebResult<List<Map<String, Object>>> search(
            @RequestParam(required = false) String nationalId,
            @RequestParam(required = false) String name) {
        if (nationalId != null && !nationalId.isBlank()) {
            Optional<PatientModel> maybe = reads.findByNationalId(nationalId);
            return WebResult.ok(maybe.map(p -> List.of(toPreview(p))).orElse(List.of()));
        }
        if (name != null && !name.isBlank()) {
            // Simple fullName contains; uses repository helper
            // (delegating to reads for service boundary respect)
            // No specific finder yet; do via patient repo via reads
            return WebResult.ok(reads.searchByName(name).stream().map(this::toPreview).toList());
        }
        return WebResult.ok(List.of());
    }

    /** Staff/doctor-friendly summary: demographics + last 5 finalized visit previews. */
    @GetMapping("/{patientId}")
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR')")
    public WebResult<PatientSummaryDTO> summary(@PathVariable UUID patientId) {
        return WebResult.ok(reads.summary(patientId));
    }

    @GetMapping("/{patientId}/clinical-profile")
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN','PATIENT')")
    public WebResult<Map<String, Object>> getClinicalProfile(@PathVariable UUID patientId,
                                                              Authentication auth) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
        // PATIENT role can only read its own profile
        if ("PATIENT".equals(claims.role().name())) {
            PatientModel ownPatient = reads.findByUserId(claims.userId()).orElse(null);
            if (ownPatient == null || !ownPatient.getId().equals(patientId)) {
                return WebResult.error(ResultCode.FORBIDDEN, "patient profile not yours");
            }
        }
        Optional<PatientClinicalProfileModel> maybe = reads.getClinicalProfile(patientId);
        return WebResult.ok(maybe.map(PatientsController::toMap).orElse(emptyProfile(patientId)));
    }

    @PatchMapping("/{patientId}/clinical-profile")
    @PreAuthorize("hasAnyRole('STAFF','DOCTOR','ADMIN','PATIENT')")
    public WebResult<Void> patchClinicalProfile(@PathVariable UUID patientId,
                                                  @RequestBody Map<String, Object> patch,
                                                  Authentication auth) {
        JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
        if ("PATIENT".equals(claims.role().name())) {
            PatientModel ownPatient = reads.findByUserId(claims.userId()).orElse(null);
            if (ownPatient == null || !ownPatient.getId().equals(patientId)) {
                return WebResult.error(ResultCode.FORBIDDEN, "patient profile not yours");
            }
        }
        String source = "PATIENT".equals(claims.role().name()) ? "PORTAL" : "DOCTOR_VISIT";
        writes.updateClinicalProfile(patientId, patch, source, claims.userId(), claims.role().name());
        return WebResult.ok(null);
    }

    private static Map<String, Object> emptyProfile(UUID patientId) {
        Map<String, Object> m = new HashMap<>();
        m.put("patientId", patientId.toString());
        m.put("completenessState", "INCOMPLETE");
        m.put("drugAllergies", List.of());
        m.put("chronicConditions", List.of());
        m.put("regularMedications", List.of());
        return m;
    }

    private static Map<String, Object> toMap(PatientClinicalProfileModel p) {
        Map<String, Object> m = new HashMap<>();
        m.put("patientId", p.getPatientId().toString());
        m.put("weightKg", p.getWeightKg());
        m.put("weightKgUpdatedAt", p.getWeightKgUpdatedAt());
        m.put("weightKgSource", p.getWeightKgSource());
        m.put("heightCm", p.getHeightCm());
        m.put("heightCmUpdatedAt", p.getHeightCmUpdatedAt());
        m.put("heightCmSource", p.getHeightCmSource());
        m.put("drugAllergies", p.getDrugAllergies());
        m.put("drugAllergiesUpdatedAt", p.getDrugAllergiesUpdatedAt());
        m.put("drugAllergiesSource", p.getDrugAllergiesSource());
        m.put("chronicConditions", p.getChronicConditions());
        m.put("chronicConditionsUpdatedAt", p.getChronicConditionsUpdatedAt());
        m.put("chronicConditionsSource", p.getChronicConditionsSource());
        m.put("regularMedications", p.getRegularMedications());
        m.put("regularMedicationsUpdatedAt", p.getRegularMedicationsUpdatedAt());
        m.put("regularMedicationsSource", p.getRegularMedicationsSource());
        m.put("pregnancyStatus", p.getPregnancyStatus());
        m.put("pregnancyEdd", p.getPregnancyEdd());
        m.put("completenessState", p.getCompletenessState());
        return m;
    }

    private Map<String, Object> toPreview(PatientModel p) {
        Map<String, Object> m = new HashMap<>();
        m.put("patientId", p.getId().toString());
        m.put("fullName", p.getFullName());
        m.put("dateOfBirth", p.getDateOfBirth());
        m.put("phone", p.getPhone());
        return m;
    }

    private static String randomPassword() {
        return "Tmp" + java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 14);
    }
}
