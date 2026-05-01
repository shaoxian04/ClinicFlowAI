package my.cliniflow.infrastructure.repository.schedule;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * JPA entity for the {@code schedule_template} table.
 *
 * <p>Stores a doctor's weekly availability template. {@code weeklyHours} is a
 * JSON map keyed by ISO day-of-week abbreviation (e.g. "MON") whose values are
 * lists of [startTime, endTime] window pairs.
 *
 * <p>{@code gmtCreate} / {@code gmtModified} are DB-defaulted and therefore
 * declared {@code insertable=false, updatable=false}.
 */
@Entity
@Table(
    name = "schedule_template",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_schedule_template_doctor_eff",
        columnNames = {"doctor_id", "effective_from"}
    )
)
public class ScheduleTemplateEntity {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "slot_minutes", nullable = false)
    private Short slotMinutes;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "weekly_hours", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> weeklyHours;

    @Column(name = "cancel_lead_hours", nullable = false)
    private Short cancelLeadHours;

    @Column(name = "generation_horizon_days", nullable = false)
    private Short generationHorizonDays;

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

    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public void setEffectiveFrom(LocalDate v) { this.effectiveFrom = v; }

    public Short getSlotMinutes() { return slotMinutes; }
    public void setSlotMinutes(Short v) { this.slotMinutes = v; }

    public Map<String, Object> getWeeklyHours() { return weeklyHours; }
    public void setWeeklyHours(Map<String, Object> v) { this.weeklyHours = v; }

    public Short getCancelLeadHours() { return cancelLeadHours; }
    public void setCancelLeadHours(Short v) { this.cancelLeadHours = v; }

    public Short getGenerationHorizonDays() { return generationHorizonDays; }
    public void setGenerationHorizonDays(Short v) { this.generationHorizonDays = v; }

    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
