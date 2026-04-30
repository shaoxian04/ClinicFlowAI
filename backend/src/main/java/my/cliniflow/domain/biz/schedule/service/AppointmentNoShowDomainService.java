package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Domain service that performs the NO_SHOW transition for a BOOKED appointment.
 *
 * <p>The transition is guarded in {@link AppointmentModel#markNoShow()} — only
 * BOOKED appointments may be marked as no-show; any other status causes an
 * {@link IllegalStateException}.
 */
@Service
public class AppointmentNoShowDomainService {

    private final AppointmentRepository appts;

    public AppointmentNoShowDomainService(AppointmentRepository appts) {
        this.appts = appts;
    }

    /**
     * Marks the appointment as NO_SHOW.
     *
     * @throws IllegalStateException if the appointment does not exist or is not BOOKED
     */
    @Transactional
    public AppointmentModel markNoShow(UUID appointmentId) {
        AppointmentModel appointment = appts.findById(appointmentId)
            .orElseThrow(() -> new IllegalStateException(
                "appointment not found: " + appointmentId));

        appointment.markNoShow();
        return appts.save(appointment);
    }
}
