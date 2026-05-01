package my.cliniflow.infrastructure.repository.schedule;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity for the {@code appointment_slots} table.
 *
 * <p>Eagerly-materialised concrete slots generated from a
 * {@link ScheduleTemplateEntity}. Each slot has a doctor, a start/end time,
 * and a lifecycle status (AVAILABLE → BOOKED / BLOCKED / CLOSED).
 *
 * <p>The production Postgres schema enforces a partial unique index
 * {@code (doctor_id, start_at) WHERE status = 'AVAILABLE'} to prevent
 * double-booking. That partial index is not enforceable in H2; the
 * full unique {@code (doctor_id, start_at)} is retained for test safety.
 */
@Entity
@Table(
    name = "appointment_slots",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_slots_doctor_start",
        columnNames = {"doctor_id", "start_at"}
    )
)
public class AppointmentSlotEntity {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    @Column(name = "start_at", nullable = false)
    private OffsetDateTime startAt;

    @Column(name = "end_at", nullable = false)
    private OffsetDateTime endAt;

    /** One of AVAILABLE / BOOKED / BLOCKED / CLOSED. */
    @Column(nullable = false, length = 16)
    private String status = "AVAILABLE";

    @Column(name = "gmt_create", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    // -----------------------------------------------------------------------
    // Getters / Setters
    // -----------------------------------------------------------------------

    public UUID getId() { return id; }

    public UUID getDoctorId() { return doctorId; }
    public void setDoctorId(UUID v) { this.doctorId = v; }

    public OffsetDateTime getStartAt() { return startAt; }
    public void setStartAt(OffsetDateTime v) { this.startAt = v; }

    public OffsetDateTime getEndAt() { return endAt; }
    public void setEndAt(OffsetDateTime v) { this.endAt = v; }

    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }

    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
