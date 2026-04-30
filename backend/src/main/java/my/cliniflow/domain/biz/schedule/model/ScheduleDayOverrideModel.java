package my.cliniflow.domain.biz.schedule.model;

import my.cliniflow.domain.biz.schedule.enums.OverrideType;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Objects;
import java.util.UUID;

/**
 * Domain model for a schedule day override. Represents a staff-managed
 * exception to the regular schedule template for a specific doctor on a
 * specific date.
 *
 * <p>Two override types are supported:
 * <ul>
 *   <li>{@link OverrideType#DAY_CLOSED} — the entire day is closed; window
 *       fields are null.</li>
 *   <li>{@link OverrideType#WINDOW_BLOCKED} — a specific time window is
 *       blocked; both window fields must be non-null and
 *       {@code windowEnd > windowStart}.</li>
 * </ul>
 */
public class ScheduleDayOverrideModel {

    private UUID id;
    private final UUID doctorId;
    private final LocalDate overrideDate;
    private final OverrideType type;
    private final LocalTime windowStart;
    private final LocalTime windowEnd;
    private final String reason;
    private final UUID createdBy;

    // -----------------------------------------------------------------------
    // Private constructor
    // -----------------------------------------------------------------------

    private ScheduleDayOverrideModel(
            UUID id,
            UUID doctorId,
            LocalDate overrideDate,
            OverrideType type,
            LocalTime windowStart,
            LocalTime windowEnd,
            String reason,
            UUID createdBy) {
        this.id = id;
        this.doctorId = doctorId;
        this.overrideDate = overrideDate;
        this.type = type;
        this.windowStart = windowStart;
        this.windowEnd = windowEnd;
        this.reason = reason;
        this.createdBy = createdBy;
    }

    // -----------------------------------------------------------------------
    // Static factories
    // -----------------------------------------------------------------------

    /**
     * Creates a DAY_CLOSED override. Window fields are always null for this type.
     */
    public static ScheduleDayOverrideModel closeDay(
            UUID doctorId,
            LocalDate date,
            String reason,
            UUID createdBy) {
        Objects.requireNonNull(doctorId, "doctorId");
        Objects.requireNonNull(date, "date");
        Objects.requireNonNull(createdBy, "createdBy");
        return new ScheduleDayOverrideModel(
            null, doctorId, date, OverrideType.DAY_CLOSED, null, null, reason, createdBy);
    }

    /**
     * Creates a WINDOW_BLOCKED override. Both window times must be non-null and
     * {@code windowEnd} must be strictly after {@code windowStart}.
     *
     * @throws IllegalArgumentException if window times are null or windowEnd is not
     *                                  after windowStart
     */
    public static ScheduleDayOverrideModel blockWindow(
            UUID doctorId,
            LocalDate date,
            LocalTime windowStart,
            LocalTime windowEnd,
            String reason,
            UUID createdBy) {
        Objects.requireNonNull(doctorId, "doctorId");
        Objects.requireNonNull(date, "date");
        Objects.requireNonNull(createdBy, "createdBy");
        if (windowStart == null || windowEnd == null) {
            throw new IllegalArgumentException(
                "windowStart and windowEnd are required for WINDOW_BLOCKED");
        }
        if (!windowEnd.isAfter(windowStart)) {
            throw new IllegalArgumentException(
                "windowEnd must be after windowStart");
        }
        return new ScheduleDayOverrideModel(
            null, doctorId, date, OverrideType.WINDOW_BLOCKED,
            windowStart, windowEnd, reason, createdBy);
    }

    /**
     * Reconstructs a {@code ScheduleDayOverrideModel} from a JPA entity.
     * For infrastructure-layer use only.
     */
    public static ScheduleDayOverrideModel hydrate(
            UUID id,
            UUID doctorId,
            LocalDate overrideDate,
            OverrideType type,
            LocalTime windowStart,
            LocalTime windowEnd,
            String reason,
            UUID createdBy) {
        return new ScheduleDayOverrideModel(
            id, doctorId, overrideDate, type, windowStart, windowEnd, reason, createdBy);
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
    public LocalDate getOverrideDate() { return overrideDate; }
    public OverrideType getType() { return type; }
    public LocalTime getWindowStart() { return windowStart; }
    public LocalTime getWindowEnd() { return windowEnd; }
    public String getReason() { return reason; }
    public UUID getCreatedBy() { return createdBy; }
}
