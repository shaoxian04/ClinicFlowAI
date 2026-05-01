package my.cliniflow.controller.biz.staff.response;

import java.util.UUID;

/**
 * Read DTO for one entry of the staff "today" waiting list.
 *
 * @param appointmentId   appointment row id (immutable across the visit lifecycle)
 * @param patientId       patient row id (UUID, not external national id)
 * @param patientName     denormalised patient full-name; {@code "—"} when unknown
 * @param preVisitStatus  one of {@code "none"} | {@code "pending"} | {@code "submitted"}
 * @param arrivedAt       ISO-8601 instant the patient checked in; {@code null} until they arrive
 * @param slotStartAt     ISO-8601 instant of the scheduled slot start (clinic-local zone)
 * @param type            appointment type — {@code NEW_SYMPTOM} or {@code FOLLOW_UP}
 * @param doctorName      denormalised doctor full-name (with {@code "Dr."} prefix); {@code "—"} when unknown
 * @param checkedIn       {@code true} when {@code AppointmentStatus.CHECKED_IN} (= status flipped at front desk)
 */
public record WaitingEntryDTO(
    UUID appointmentId,
    UUID patientId,
    String patientName,
    String preVisitStatus,
    String arrivedAt,
    String slotStartAt,
    String type,
    String doctorName,
    boolean checkedIn
) {}
