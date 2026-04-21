package my.cliniflow.controller.biz.patient.response;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Post-visit summary payload returned to the patient portal.
 *
 * <p>Task 8.1 precondition: includes optional {@code redFlags} (things the patient
 * should come back sooner for) and {@code followUp} (the next-step instruction).
 * The underlying domain model does not yet persist these fields; the service
 * currently returns an empty list and a {@code null} follow-up, and the frontend
 * falls back to a no-op render when either is empty. A later task populates the
 * fields from the Post-Visit agent.
 */
public record PatientVisitDetailResponse(
    UUID visitId,
    OffsetDateTime finalizedAt,
    String summaryEn,
    String summaryMs,
    List<Medication> medications,
    List<String> redFlags,
    FollowUp followUp
) {
    public record Medication(String name, String dosage, String frequency) {}
    public record FollowUp(String when, String instruction) {}
}
