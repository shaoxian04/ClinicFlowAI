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
 * <p>Lifecycle: BOOKED → COMPLETED | CANCELLED | NO_SHOW. All transitions
 * are guarded — attempting an invalid transition throws
 * {@link IllegalStateException}.
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
            UUID cancelledBy) {
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
            AppointmentStatus.BOOKED, null, null, null);
    }

    /**
     * Reconstructs an {@code AppointmentModel} from a JPA entity. For use by
     * the infrastructure layer only — bypasses all validation rules.
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
        return new AppointmentModel(
            id, slotId, patientId, visitId, type, parentVisitId,
            status, cancelReason, cancelledAt, cancelledBy);
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
}
