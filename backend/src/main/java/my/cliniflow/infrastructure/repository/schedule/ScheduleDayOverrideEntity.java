package my.cliniflow.infrastructure.repository.schedule;

import jakarta.persistence.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * JPA entity for the {@code schedule_day_overrides} table.
 *
 * <p>Staff-managed exceptions to the regular schedule template:
 * <ul>
 *   <li>{@code DAY_CLOSED} — entire day is closed; {@code windowStart} /
 *       {@code windowEnd} must be null.</li>
 *   <li>{@code WINDOW_BLOCKED} — a specific time window is blocked;
 *       both {@code windowStart} and {@code windowEnd} must be non-null
 *       and {@code windowEnd > windowStart}. This is enforced by the
 *       {@code window_required_when_blocked} CHECK constraint in the DB.</li>
 * </ul>
 */
@Entity
@Table(name = "schedule_day_overrides")
public class ScheduleDayOverrideEntity {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    @Column(name = "override_date", nullable = false)
    private LocalDate overrideDate;

    /** One of DAY_CLOSED / WINDOW_BLOCKED. */
    @Column(name = "override_type", nullable = false, length = 16)
    private String overrideType;

    @Column(name = "window_start")
    private LocalTime windowStart;

    @Column(name = "window_end")
    private LocalTime windowEnd;

    @Column(length = 255)
    private String reason;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "gmt_create", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    // -----------------------------------------------------------------------
    // Getters / Setters
    // -----------------------------------------------------------------------

    public UUID getId() { return id; }

    public UUID getDoctorId() { return doctorId; }
    public void setDoctorId(UUID v) { this.doctorId = v; }

    public LocalDate getOverrideDate() { return overrideDate; }
    public void setOverrideDate(LocalDate v) { this.overrideDate = v; }

    public String getOverrideType() { return overrideType; }
    public void setOverrideType(String v) { this.overrideType = v; }

    public LocalTime getWindowStart() { return windowStart; }
    public void setWindowStart(LocalTime v) { this.windowStart = v; }

    public LocalTime getWindowEnd() { return windowEnd; }
    public void setWindowEnd(LocalTime v) { this.windowEnd = v; }

    public String getReason() { return reason; }
    public void setReason(String v) { this.reason = v; }

    public UUID getCreatedBy() { return createdBy; }
    public void setCreatedBy(UUID v) { this.createdBy = v; }

    public OffsetDateTime getGmtCreate() { return gmtCreate; }
}
