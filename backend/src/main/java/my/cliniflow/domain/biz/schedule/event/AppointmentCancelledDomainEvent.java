package my.cliniflow.domain.biz.schedule.event;

import java.util.UUID;

public record AppointmentCancelledDomainEvent(UUID appointmentId, UUID patientId) {}
