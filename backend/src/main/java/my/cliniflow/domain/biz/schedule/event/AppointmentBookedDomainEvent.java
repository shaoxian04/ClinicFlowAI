package my.cliniflow.domain.biz.schedule.event;

import java.util.UUID;

public record AppointmentBookedDomainEvent(UUID appointmentId, UUID patientId, UUID slotId) {}
