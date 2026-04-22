package my.cliniflow.domain.biz.visit.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * Mirror of agent/app/schemas/report.py::MedicalReport. Every snake_case field
 * declared via @JsonProperty so agent JSON round-trips cleanly. Do not add
 * fields here without also adding them to the Pydantic model (source of truth).
 *
 * See spec §4.7 and contract-verification checklist §4.8.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record MedicalReportDto(
    Subjective subjective,
    Objective objective,
    Assessment assessment,
    Plan plan,
    @JsonProperty("confidence_flags") Map<String, String> confidenceFlags
) {
    public record Subjective(
        @JsonProperty("chief_complaint") String chiefComplaint,
        @JsonProperty("history_of_present_illness") String historyOfPresentIllness,
        @JsonProperty("symptom_duration") String symptomDuration,
        @JsonProperty("associated_symptoms") List<String> associatedSymptoms,
        @JsonProperty("relevant_history") List<String> relevantHistory
    ) {}

    public record Objective(
        @JsonProperty("vital_signs") Map<String, String> vitalSigns,
        @JsonProperty("physical_exam") String physicalExam
    ) {}

    public record Assessment(
        @JsonProperty("primary_diagnosis") String primaryDiagnosis,
        @JsonProperty("differential_diagnoses") List<String> differentialDiagnoses,
        @JsonProperty("icd10_codes") List<String> icd10Codes
    ) {}

    public record Plan(
        List<MedicationOrder> medications,
        List<String> investigations,
        @JsonProperty("lifestyle_advice") List<String> lifestyleAdvice,
        @JsonProperty("follow_up") FollowUp followUp,
        @JsonProperty("red_flags") List<String> redFlags
    ) {}

    public record MedicationOrder(
        @JsonProperty("drug_name") String drugName,
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
