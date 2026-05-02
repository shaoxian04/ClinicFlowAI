package my.cliniflow.application.biz.schedule;

import my.cliniflow.controller.biz.schedule.request.AppointmentBookRequest;

import java.util.UUID;

/**
 * Orchestrates appointment booking + cancellation: derives identity from the
 * authenticated user, validates ownership on visit refs, calls the domain
 * services, writes audit rows, and publishes domain events.
 */
public interface AppointmentWriteAppService {

    UUID book(UUID userId, AppointmentBookRequest req);

    void cancel(UUID userId, UUID appointmentId, String reason);
}
