package my.cliniflow.domain.biz.visit.event;

import java.time.LocalDate;
import java.util.UUID;

/**
 * Emitted by {@link my.cliniflow.application.biz.visit.SoapWriteAppService#finalize}
 * after the visit is marked FINALIZED and the medical report is persisted.
 *
 * <p>Picked up by the notification listeners in Phase 7 to enqueue:
 * <ul>
 *   <li>SOAP_FINALIZED_MEDS reminder when {@code hasMedications=true}</li>
 *   <li>SOAP_FINALIZED_FOLLOWUP reminder when {@code followUpDate != null}</li>
 * </ul>
 *
 * <p>{@code followUpDate} is null in the MVP — follow-up scheduling is
 * patient-initiated via the appointment booking flow, not derived from the
 * SOAP plan text.
 */
public record SoapFinalizedDomainEvent(
    UUID visitId,
    UUID patientId,
    boolean hasMedications,
    LocalDate followUpDate
) {}
