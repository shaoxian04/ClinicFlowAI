package my.cliniflow.infrastructure.notification.listener;

import my.cliniflow.application.biz.schedule.AppointmentReadAppService;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.event.AppointmentCancelledDomainEvent;
import my.cliniflow.infrastructure.notification.outbox.NotificationEventType;
import my.cliniflow.infrastructure.notification.outbox.NotificationOutboxWriter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AppointmentCancelledListenerTest {

    static final UUID APPT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000b01");
    static final UUID SLOT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000b02");
    static final UUID DOCTOR_ID  = UUID.fromString("00000000-0000-0000-0000-000000000b03");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000b04");

    NotificationOutboxWriter writer;
    AppointmentReadAppService reads;
    AppointmentCancelledListener listener;

    @BeforeEach
    void setUp() {
        writer = mock(NotificationOutboxWriter.class);
        reads = mock(AppointmentReadAppService.class);
        listener = new AppointmentCancelledListener(writer, reads);
        when(writer.enqueueWhatsApp(any(), any(), any(), any(), any()))
            .thenReturn(Optional.of(UUID.randomUUID()));
    }

    @Test
    void onCancelled_enqueues_outbox_row_with_correct_template_and_idempotency_key() {
        AppointmentDTO dto = new AppointmentDTO(
            APPT_ID, SLOT_ID,
            OffsetDateTime.parse("2026-05-05T10:00:00+08:00"),
            OffsetDateTime.parse("2026-05-05T10:15:00+08:00"),
            DOCTOR_ID, PATIENT_ID, null,
            "NEW_SYMPTOM", null, "CANCELLED",
            OffsetDateTime.parse("2026-05-04T08:00:00+08:00"));
        when(reads.findOneInternal(APPT_ID)).thenReturn(dto);

        listener.onCancelled(new AppointmentCancelledDomainEvent(APPT_ID, PATIENT_ID));

        ArgumentCaptor<Map<String, Object>> payloadCap = ArgumentCaptor.forClass(Map.class);
        verify(writer).enqueueWhatsApp(
            eq(NotificationEventType.APPOINTMENT_CANCELLED),
            eq("appointment_cancelled_v1"),
            eq(PATIENT_ID),
            payloadCap.capture(),
            eq("APPOINTMENT_CANCELLED:" + APPT_ID));

        Map<String, Object> payload = payloadCap.getValue();
        assertThat(payload).containsEntry("appointmentId", APPT_ID.toString());
        assertThat(payload).containsEntry("patientId", PATIENT_ID.toString());
        assertThat(payload).containsKey("slotStartAt");
    }
}
