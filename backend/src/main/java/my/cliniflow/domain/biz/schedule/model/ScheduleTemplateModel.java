package my.cliniflow.domain.biz.schedule.model;

import my.cliniflow.domain.biz.schedule.info.WeeklyHours;

import java.time.LocalDate;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Domain model for a doctor's weekly schedule template. Holds configuration
 * for slot generation: the effective start date, slot duration, working hours
 * per day of the week, and booking constraints.
 *
 * <p>Valid values for {@code slotMinutes}: 10, 15, 20, 30 (matches the DB
 * CHECK constraint).
 */
public class ScheduleTemplateModel {

    private static final Set<Short> VALID_SLOT_MINUTES = Set.of(
        (short) 10, (short) 15, (short) 20, (short) 30);

    private UUID id;
    private final UUID doctorId;
    private final LocalDate effectiveFrom;
    private final short slotMinutes;
    private final WeeklyHours weeklyHours;
    private final short cancelLeadHours;
    private final short generationHorizonDays;

    // -----------------------------------------------------------------------
    // Private constructor
    // -----------------------------------------------------------------------

    private ScheduleTemplateModel(
            UUID id,
            UUID doctorId,
            LocalDate effectiveFrom,
            short slotMinutes,
            WeeklyHours weeklyHours,
            short cancelLeadHours,
            short generationHorizonDays) {
        this.id = id;
        this.doctorId = doctorId;
        this.effectiveFrom = effectiveFrom;
        this.slotMinutes = slotMinutes;
        this.weeklyHours = weeklyHours;
        this.cancelLeadHours = cancelLeadHours;
        this.generationHorizonDays = generationHorizonDays;
    }

    // -----------------------------------------------------------------------
    // Static factories
    // -----------------------------------------------------------------------

    /**
     * Creates a new schedule template. Validates slot minutes, cancel lead
     * hours, and generation horizon days.
     *
     * @throws IllegalArgumentException if any constraint is violated
     */
    public static ScheduleTemplateModel create(
            UUID doctorId,
            LocalDate effectiveFrom,
            short slotMinutes,
            WeeklyHours weeklyHours,
            short cancelLeadHours,
            short generationHorizonDays) {
        Objects.requireNonNull(doctorId, "doctorId");
        Objects.requireNonNull(effectiveFrom, "effectiveFrom");
        Objects.requireNonNull(weeklyHours, "weeklyHours");

        if (!VALID_SLOT_MINUTES.contains(slotMinutes)) {
            throw new IllegalArgumentException(
                "slotMinutes must be one of 10, 15, 20, 30 but was " + slotMinutes);
        }
        if (cancelLeadHours < 0) {
            throw new IllegalArgumentException(
                "cancelLeadHours must be >= 0 but was " + cancelLeadHours);
        }
        if (generationHorizonDays <= 0) {
            throw new IllegalArgumentException(
                "generationHorizonDays must be > 0 but was " + generationHorizonDays);
        }

        return new ScheduleTemplateModel(
            null, doctorId, effectiveFrom, slotMinutes,
            weeklyHours, cancelLeadHours, generationHorizonDays);
    }

    /**
     * Reconstructs a {@code ScheduleTemplateModel} from a JPA entity.
     * For infrastructure-layer use only — bypasses validation.
     */
    public static ScheduleTemplateModel hydrate(
            UUID id,
            UUID doctorId,
            LocalDate effectiveFrom,
            short slotMinutes,
            WeeklyHours weeklyHours,
            short cancelLeadHours,
            short generationHorizonDays) {
        return new ScheduleTemplateModel(
            id, doctorId, effectiveFrom, slotMinutes,
            weeklyHours, cancelLeadHours, generationHorizonDays);
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
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public short getSlotMinutes() { return slotMinutes; }
    public WeeklyHours getWeeklyHours() { return weeklyHours; }
    public short getCancelLeadHours() { return cancelLeadHours; }
    public short getGenerationHorizonDays() { return generationHorizonDays; }
}
