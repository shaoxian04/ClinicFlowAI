package my.cliniflow.domain.biz.schedule.model;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Aggregate root for a patient appointment. Behavior is enforced by
 * state-transition methods; the {@link #hydrate} factory is for
 * infrastructure-layer reconstruction only.
 *
 * <p>Lifecycle: BOOKED → CHECKED_IN → COMPLETED, with terminal branches
 * to CANCELLED or NO_SHOW from BOOKED. All transitions are guarded —
 * attempting an invalid transition throws {@link IllegalStateException}.
 */
public class AppointmentModel {

    private UUID id;
    private final UUID slotId;
    private final UUID patientId;
    private final UUID visitId;
    private final AppointmentType type;
    private final UUID parentVisitId;
    private AppointmentStatus status;
    private String cancelReason;
    private OffsetDateTime cancelledAt;
    private UUID cancelledBy;
    private OffsetDateTime checkedInAt;

    // -----------------------------------------------------------------------
    // Private constructor — use static factories
    // -----------------------------------------------------------------------

    private AppointmentModel(
            UUID id,
            UUID slotId,
            UUID patientId,
            UUID visitId,
            AppointmentType type,
            UUID parentVisitId,
            AppointmentStatus status,
            String cancelReason,
            OffsetDateTime cancelledAt,
            UUID cancelledBy,
            OffsetDateTime checkedInAt) {
        this.id = id;
        this.slotId = slotId;
        this.patientId = patientId;
        this.visitId = visitId;
        this.type = type;
        this.parentVisitId = parentVisitId;
        this.status = status;
        this.cancelReason = cancelReason;
        this.cancelledAt = cancelledAt;
        this.cancelledBy = cancelledBy;
        this.checkedInAt = checkedInAt;
    }

    // -----------------------------------------------------------------------
    // Static factories
    // -----------------------------------------------------------------------

    /**
     * Books a new appointment. Validates the type/parentVisitId pairing and
     * returns an instance in {@link AppointmentStatus#BOOKED} state.
     *
     * @throws IllegalArgumentException if FOLLOW_UP is missing a parent visit id,
     *                                  or if NEW_SYMPTOM has a parent visit id
     */
    public static AppointmentModel book(
            UUID slotId,
            UUID patientId,
            UUID visitId,
            AppointmentType type,
            UUID parentVisitId) {
        Objects.requireNonNull(slotId, "slotId");
        Objects.requireNonNull(patientId, "patientId");
        Objects.requireNonNull(visitId, "visitId");
        Objects.requireNonNull(type, "type");

        if (type == AppointmentType.FOLLOW_UP && parentVisitId == null) {
            throw new IllegalArgumentException("parent_visit_id required for FOLLOW_UP");
        }
        if (type == AppointmentType.NEW_SYMPTOM && parentVisitId != null) {
            throw new IllegalArgumentException("parent_visit_id only allowed for FOLLOW_UP");
        }

        return new AppointmentModel(
            null, slotId, patientId, visitId, type, parentVisitId,
            AppointmentStatus.BOOKED, null, null, null, null);
    }

    /**
     * Reconstructs an {@code AppointmentModel} from a JPA entity, leaving
     * {@code checkedInAt} as {@code null}. For backwards compatibility with
     * callers that don't yet supply check-in metadata.
     */
    public static AppointmentModel hydrate(
            UUID id,
            UUID slotId,
            UUID patientId,
            UUID visitId,
            AppointmentType type,
            UUID parentVisitId,
            AppointmentStatus status,
            String cancelReason,
            OffsetDateTime cancelledAt,
            UUID cancelledBy) {
        return hydrate(id, slotId, patientId, visitId, type, parentVisitId,
            status, cancelReason, cancelledAt, cancelledBy, null);
    }

    /**
     * Reconstructs an {@code AppointmentModel} from a JPA entity, including
     * check-in metadata. For use by the infrastructure layer only — bypasses
     * all validation rules.
     */
    public static AppointmentModel hydrate(
            UUID id,
            UUID slotId,
            UUID patientId,
            UUID visitId,
            AppointmentType type,
            UUID parentVisitId,
            AppointmentStatus status,
            String cancelReason,
            OffsetDateTime cancelledAt,
            UUID cancelledBy,
            OffsetDateTime checkedInAt) {
        return new AppointmentModel(
            id, slotId, patientId, visitId, type, parentVisitId,
            status, cancelReason, cancelledAt, cancelledBy, checkedInAt);
    }

    // -----------------------------------------------------------------------
    // State-transition methods
    // -----------------------------------------------------------------------

    /**
     * Cancels this appointment.
     *
     * @throws IllegalStateException if the appointment is not in BOOKED status
     */
    public void cancel(String reason, UUID byUser, OffsetDateTime now) {
        if (status != AppointmentStatus.BOOKED) {
            throw new IllegalStateException(
                "Cannot cancel appointment in status " + status);
        }
        this.status = AppointmentStatus.CANCELLED;
        this.cancelReason = reason;
        this.cancelledBy = byUser;
        this.cancelledAt = now;
    }

    /**
     * Marks this appointment as a no-show.
     *
     * @throws IllegalStateException if the appointment is not in BOOKED status
     */
    public void markNoShow() {
        if (status != AppointmentStatus.BOOKED) {
            throw new IllegalStateException(
                "Cannot mark NO_SHOW for appointment in status " + status);
        }
        this.status = AppointmentStatus.NO_SHOW;
    }

    /**
     * Marks this appointment as completed.
     *
     * @throws IllegalStateException if the appointment is not in BOOKED status
     */
    public void markCompleted() {
        if (status != AppointmentStatus.BOOKED) {
            throw new IllegalStateException(
                "Cannot complete appointment in status " + status);
        }
        this.status = AppointmentStatus.COMPLETED;
    }

    // -----------------------------------------------------------------------
    // Infra back-fill
    // -----------------------------------------------------------------------

    /**
     * Sets the generated id after the entity has been persisted by the
     * infrastructure layer.
     */
    public void hydrateId(UUID id) {
        this.id = id;
    }

    // -----------------------------------------------------------------------
    // Getters
    // -----------------------------------------------------------------------

    public UUID getId() { return id; }
    public UUID getSlotId() { return slotId; }
    public UUID getPatientId() { return patientId; }
    public UUID getVisitId() { return visitId; }
    public AppointmentType getType() { return type; }
    public UUID getParentVisitId() { return parentVisitId; }
    public AppointmentStatus getStatus() { return status; }
    public String getCancelReason() { return cancelReason; }
    public OffsetDateTime getCancelledAt() { return cancelledAt; }
    public UUID getCancelledBy() { return cancelledBy; }
    public OffsetDateTime getCheckedInAt() { return checkedInAt; }

    // -----------------------------------------------------------------------
    // Mutators (infrastructure / write-app-service use only)
    // -----------------------------------------------------------------------

    /**
     * Sets the check-in timestamp. Intended for use by the staff check-in
     * write-app-service when transitioning {@link AppointmentStatus#BOOKED}
     * to {@link AppointmentStatus#CHECKED_IN}.
     */
    public void setCheckedInAt(OffsetDateTime v) { this.checkedInAt = v; }

    /**
     * Mutates the appointment status. Intended for the same call-site that
     * sets {@link #setCheckedInAt(OffsetDateTime)}. Validation of legal
     * transitions remains the caller's responsibility (the dedicated
     * state-transition methods on this class are still preferred where
     * applicable).
     */
    public void setStatus(AppointmentStatus v) { this.status = v; }
}
