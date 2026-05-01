package my.cliniflow.infrastructure.repository.schedule;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity for the {@code appointments} table.
 *
 * <p>An appointment links a booked {@link AppointmentSlotEntity} to a patient
 * and a clinical visit. The lifecycle is: BOOKED → COMPLETED | CANCELLED |
 * NO_SHOW.
 *
 * <p><strong>Partial unique indexes note:</strong> Production Postgres (V11)
 * enforces {@code uq_appointments_active_slot} and
 * {@code uq_appointments_active_visit} as partial uniques
 * {@code WHERE status = 'BOOKED'}. H2 does not support predicate partial
 * uniques, so those constraints are omitted from the test schema. App-layer
 * code is responsible for enforcing one active booking per slot/visit. Tests
 * in this class may demonstrate that rebooking a previously-cancelled slot is
 * NOT blocked at the DB level in the test environment — by design.
 */
@Entity
@Table(name = "appointments")
public class AppointmentEntity {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "slot_id", nullable = false)
    private UUID slotId;

    @Column(name = "patient_id", nullable = false)
    private UUID patientId;

    @Column(name = "visit_id", nullable = false)
    private UUID visitId;

    /** One of NEW_SYMPTOM / FOLLOW_UP. */
    @Column(name = "appointment_type", nullable = false, length = 16)
    private String appointmentType;

    @Column(name = "parent_visit_id")
    private UUID parentVisitId;

    /** One of BOOKED / CANCELLED / COMPLETED / NO_SHOW. */
    @Column(nullable = false, length = 16)
    private String status = "BOOKED";

    @Column(name = "cancel_reason", length = 64)
    private String cancelReason;

    @Column(name = "cancelled_at")
    private OffsetDateTime cancelledAt;

    @Column(name = "cancelled_by")
    private UUID cancelledBy;

    @Column(name = "gmt_create", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    // -----------------------------------------------------------------------
    // Getters / Setters
    // -----------------------------------------------------------------------

    public UUID getId() { return id; }

    public UUID getSlotId() { return slotId; }
    public void setSlotId(UUID v) { this.slotId = v; }

    public UUID getPatientId() { return patientId; }
    public void setPatientId(UUID v) { this.patientId = v; }

    public UUID getVisitId() { return visitId; }
    public void setVisitId(UUID v) { this.visitId = v; }

    public String getAppointmentType() { return appointmentType; }
    public void setAppointmentType(String v) { this.appointmentType = v; }

    public UUID getParentVisitId() { return parentVisitId; }
    public void setParentVisitId(UUID v) { this.parentVisitId = v; }

    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }

    public String getCancelReason() { return cancelReason; }
    public void setCancelReason(String v) { this.cancelReason = v; }

    public OffsetDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(OffsetDateTime v) { this.cancelledAt = v; }

    public UUID getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(UUID v) { this.cancelledBy = v; }

    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
