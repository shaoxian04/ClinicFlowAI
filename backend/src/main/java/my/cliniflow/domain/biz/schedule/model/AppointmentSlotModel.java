package my.cliniflow.domain.biz.schedule.model;

import my.cliniflow.domain.biz.schedule.enums.SlotStatus;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Domain model for an appointment slot. Represents a concrete, eagerly
 * materialised time block on a doctor's calendar.
 *
 * <p>Lifecycle: AVAILABLE → BOOKED (reversible to AVAILABLE via release),
 * AVAILABLE → BLOCKED, AVAILABLE → CLOSED. Transitions from BOOKED are
 * rejected for BLOCKED and CLOSED.
 */
public class AppointmentSlotModel {

    private UUID id;
    private final UUID doctorId;
    private final OffsetDateTime startAt;
    private final OffsetDateTime endAt;
    private SlotStatus status;

    // -----------------------------------------------------------------------
    // Private constructor
    // -----------------------------------------------------------------------

    private AppointmentSlotModel(
            UUID id,
            UUID doctorId,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            SlotStatus status) {
        this.id = id;
        this.doctorId = doctorId;
        this.startAt = startAt;
        this.endAt = endAt;
        this.status = status;
    }

    // -----------------------------------------------------------------------
    // Static factories
    // -----------------------------------------------------------------------

    /**
     * Creates a new AVAILABLE slot. Validates that {@code endAt} is strictly
     * after {@code startAt}.
     *
     * @throws IllegalArgumentException if endAt is not after startAt
     */
    public static AppointmentSlotModel newAvailable(
            UUID doctorId,
            OffsetDateTime startAt,
            OffsetDateTime endAt) {
        Objects.requireNonNull(doctorId, "doctorId");
        Objects.requireNonNull(startAt, "startAt");
        Objects.requireNonNull(endAt, "endAt");
        if (!endAt.isAfter(startAt)) {
            throw new IllegalArgumentException("endAt must be after startAt");
        }
        return new AppointmentSlotModel(null, doctorId, startAt, endAt, SlotStatus.AVAILABLE);
    }

    /**
     * Reconstructs an {@code AppointmentSlotModel} from a JPA entity.
     * For infrastructure-layer use only.
     */
    public static AppointmentSlotModel hydrate(
            UUID id,
            UUID doctorId,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            SlotStatus status) {
        return new AppointmentSlotModel(id, doctorId, startAt, endAt, status);
    }

    // -----------------------------------------------------------------------
    // State-transition methods
    // -----------------------------------------------------------------------

    /**
     * Transitions from AVAILABLE to BOOKED.
     *
     * @throws IllegalStateException if the slot is not AVAILABLE
     */
    public void book() {
        if (status != SlotStatus.AVAILABLE) {
            throw new IllegalStateException(
                "Cannot book slot in status " + status);
        }
        this.status = SlotStatus.BOOKED;
    }

    /**
     * Releases a BOOKED slot back to AVAILABLE (e.g. after a cancellation).
     *
     * @throws IllegalStateException if the slot is not BOOKED
     */
    public void release() {
        if (status != SlotStatus.BOOKED) {
            throw new IllegalStateException(
                "Cannot release slot in status " + status);
        }
        this.status = SlotStatus.AVAILABLE;
    }

    /**
     * Blocks an AVAILABLE slot (e.g. doctor unavailable for a specific reason).
     *
     * @throws IllegalStateException if the slot is BOOKED
     */
    public void block() {
        if (status == SlotStatus.BOOKED) {
            throw new IllegalStateException(
                "Cannot block a slot that is already BOOKED");
        }
        this.status = SlotStatus.BLOCKED;
    }

    /**
     * Closes an AVAILABLE slot permanently.
     *
     * @throws IllegalStateException if the slot is BOOKED
     */
    public void close() {
        if (status == SlotStatus.BOOKED) {
            throw new IllegalStateException(
                "Cannot close a slot that is already BOOKED");
        }
        this.status = SlotStatus.CLOSED;
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
    public UUID getDoctorId() { return doctorId; }
    public OffsetDateTime getStartAt() { return startAt; }
    public OffsetDateTime getEndAt() { return endAt; }
    public SlotStatus getStatus() { return status; }
}
