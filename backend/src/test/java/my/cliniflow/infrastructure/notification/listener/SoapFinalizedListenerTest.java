package my.cliniflow.infrastructure.notification.listener;

import my.cliniflow.domain.biz.visit.event.SoapFinalizedDomainEvent;
import my.cliniflow.infrastructure.notification.outbox.NotificationEventType;
import my.cliniflow.infrastructure.notification.outbox.NotificationOutboxWriter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SoapFinalizedListenerTest {

    static final UUID VISIT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000c01");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000c02");

    NotificationOutboxWriter writer;
    SoapFinalizedListener listener;

    @BeforeEach
    void setUp() {
        writer = mock(NotificationOutboxWriter.class);
        listener = new SoapFinalizedListener(writer);
        when(writer.enqueueWhatsApp(any(), any(), any(), any(), any()))
            .thenReturn(Optional.of(UUID.randomUUID()));
    }

    @Test
    void enqueues_meds_row_when_hasMedications_true_and_no_followup() {
        SoapFinalizedDomainEvent ev = new SoapFinalizedDomainEvent(
            VISIT_ID, PATIENT_ID, true, null);

        listener.onFinalized(ev);

        verify(writer, times(1)).enqueueWhatsApp(
            eq(NotificationEventType.SOAP_FINALIZED_MEDS),
            eq("soap_meds_summary_v1"),
            eq(PATIENT_ID),
            any(),
            eq("SOAP_FINALIZED_MEDS:" + VISIT_ID));

        verify(writer, never()).enqueueWhatsApp(
            eq(NotificationEventType.SOAP_FINALIZED_FOLLOWUP),
            any(), any(), any(), any());
    }

    @Test
    void enqueues_followup_row_when_followUpDate_set_and_no_meds() {
        SoapFinalizedDomainEvent ev = new SoapFinalizedDomainEvent(
            VISIT_ID, PATIENT_ID, false, LocalDate.of(2026, 5, 20));

        listener.onFinalized(ev);

        verify(writer, times(1)).enqueueWhatsApp(
            eq(NotificationEventType.SOAP_FINALIZED_FOLLOWUP),
            eq("soap_followup_reminder_v1"),
            eq(PATIENT_ID),
            any(),
            eq("SOAP_FINALIZED_FOLLOWUP:" + VISIT_ID));

        verify(writer, never()).enqueueWhatsApp(
            eq(NotificationEventType.SOAP_FINALIZED_MEDS),
            any(), any(), any(), any());
    }

    @Test
    void enqueues_both_when_both_flags_set() {
        SoapFinalizedDomainEvent ev = new SoapFinalizedDomainEvent(
            VISIT_ID, PATIENT_ID, true, LocalDate.of(2026, 5, 20));

        listener.onFinalized(ev);

        verify(writer, times(1)).enqueueWhatsApp(
            eq(NotificationEventType.SOAP_FINALIZED_MEDS),
            any(), any(), any(), eq("SOAP_FINALIZED_MEDS:" + VISIT_ID));

        verify(writer, times(1)).enqueueWhatsApp(
            eq(NotificationEventType.SOAP_FINALIZED_FOLLOWUP),
            any(), any(), any(), eq("SOAP_FINALIZED_FOLLOWUP:" + VISIT_ID));
    }

    @Test
    void enqueues_nothing_when_neither_flag_set() {
        SoapFinalizedDomainEvent ev = new SoapFinalizedDomainEvent(
            VISIT_ID, PATIENT_ID, false, null);

        listener.onFinalized(ev);

        verifyNoInteractions(writer);
    }
}
