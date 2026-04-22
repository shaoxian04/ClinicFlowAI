package my.cliniflow.domain.biz.visit.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * Mirror of agent/app/schemas/report.py::MedicalReport.
 *
 * Serialization strategy (see spec §4.1 + post-mortem §Meta):
 *  - AGENT → BACKEND (read):  agent sends snake_case JSON. @JsonAlias on every
 *    multi-word field accepts the snake_case incoming names.
 *  - BACKEND → FRONTEND (write): frontend TypeScript types are camelCase.
 *    Jackson default serialization uses the Java field name (camelCase),
 *    which matches the frontend type exactly.
 *
 * Do NOT use @JsonProperty here — it would force snake_case on BOTH read and
 * write, leaking agent-side naming to the frontend. (That's the exact bug this
 * commit fixed.) Alias is read-only; the record field name controls write.
 *
 * Do not add fields here without also adding them to the Pydantic model
 * (source of truth) AND the TypeScript types in frontend/lib/types/report.ts.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MedicalReportDto(
    Subjective subjective,
    Objective objective,
    Assessment assessment,
    Plan plan,
    @JsonAlias("confidence_flags") Map<String, String> confidenceFlags
) {
    public record Subjective(
        @JsonAlias("chief_complaint") String chiefComplaint,
        @JsonAlias("history_of_present_illness") String historyOfPresentIllness,
        @JsonAlias("symptom_duration") String symptomDuration,
        @JsonAlias("associated_symptoms") List<String> associatedSymptoms,
        @JsonAlias("relevant_history") List<String> relevantHistory
    ) {}

    public record Objective(
        @JsonAlias("vital_signs") Map<String, String> vitalSigns,
        @JsonAlias("physical_exam") String physicalExam
    ) {}

    public record Assessment(
        @JsonAlias("primary_diagnosis") String primaryDiagnosis,
        @JsonAlias("differential_diagnoses") List<String> differentialDiagnoses,
        @JsonAlias("icd10_codes") List<String> icd10Codes
    ) {}

    public record Plan(
        List<MedicationOrder> medications,
        List<String> investigations,
        @JsonAlias("lifestyle_advice") List<String> lifestyleAdvice,
        @JsonAlias("follow_up") FollowUp followUp,
        @JsonAlias("red_flags") List<String> redFlags
    ) {}

    public record MedicationOrder(
        @JsonAlias("drug_name") String drugName,
        String dose,
        String frequency,
        String duration,
        String route
    ) {}

    public record FollowUp(
        boolean needed,
        String timeframe,
        String reason
    ) {}
}
