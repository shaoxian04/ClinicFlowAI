package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.biz.visit.response.EvaluatorFindingDTO;

import java.util.List;
import java.util.UUID;

/**
 * Application service for visit-write operations not covered by the existing
 * {@link PreVisitWriteAppService}. Exposes the follow-up visit factory used by
 * appointment booking, plus evaluator finding acknowledge and re-evaluate flows.
 */
public interface VisitWriteAppService {

    /**
     * Opens a fresh Visit row for a follow-up appointment.
     */
    UUID openFollowUpVisit(UUID patientId, UUID parentVisitId);

    EvaluatorFindingDTO acknowledgeFinding(UUID visitId, UUID findingId, String reason, UUID doctorId);

    List<EvaluatorFindingDTO> reEvaluate(UUID visitId, UUID doctorId);
}
