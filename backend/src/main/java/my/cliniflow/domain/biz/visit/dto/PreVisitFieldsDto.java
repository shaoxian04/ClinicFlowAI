package my.cliniflow.domain.biz.visit.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Mirror of agent/app/schemas/pre_visit.py::PreVisitSlots.
 *
 * Serialization strategy (see MedicalReportDto for the full explanation):
 *  - AGENT → POSTGRES → BACKEND (read): agent persists snake_case jsonb.
 *    @JsonAlias accepts the snake_case keys when Jackson converts the raw
 *    Map<String,Object> into this record.
 *  - BACKEND → FRONTEND (write): Jackson serializes using the Java field
 *    name (camelCase), matching frontend/lib/types/visit.ts::PreVisitFields.
 *
 * Do NOT use @JsonProperty here — it would force snake_case on both sides.
 * @JsonAlias is read-only; the record field name controls write.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PreVisitFieldsDto(
    @JsonAlias("chief_complaint")     String chiefComplaint,
    @JsonAlias("symptom_duration")    String symptomDuration,
    @JsonAlias("pain_severity")       Integer painSeverity,
    @JsonAlias("known_allergies")     List<String> knownAllergies,
    @JsonAlias("current_medications") List<String> currentMedications,
    @JsonAlias("relevant_history")    List<String> relevantHistory
) {}
