package my.cliniflow.domain.biz.schedule.enums;

/**
 * Appointment lifecycle status.
 *
 * <ul>
 *   <li>{@link #BOOKED} — initial state after a patient or staff books a slot.</li>
 *   <li>{@link #CHECKED_IN} — patient has physically arrived at the clinic
 *       (set by staff via the front-desk check-in flow).</li>
 *   <li>{@link #CANCELLED} — appointment cancelled by patient or staff.</li>
 *   <li>{@link #COMPLETED} — visit finalized by the doctor.</li>
 *   <li>{@link #NO_SHOW} — patient did not arrive within the no-show window.</li>
 * </ul>
 */
public enum AppointmentStatus { BOOKED, CHECKED_IN, CANCELLED, COMPLETED, NO_SHOW }
