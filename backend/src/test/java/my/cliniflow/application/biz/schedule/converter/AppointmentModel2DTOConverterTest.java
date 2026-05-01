package my.cliniflow.application.biz.schedule.converter;

import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AppointmentModel2DTOConverterTest {

    private static final UUID APPT_ID     = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID SLOT_ID     = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID PATIENT_ID  = UUID.fromString("00000000-0000-0000-0000-000000000003");
    private static final UUID VISIT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000004");
    private static final UUID DOCTOR_ID   = UUID.fromString("00000000-0000-0000-0000-000000000005");
    private static final UUID CANCELLER_ID = UUID.fromString("00000000-0000-0000-0000-000000000006");

    private static final OffsetDateTime SLOT_START =
        OffsetDateTime.parse("2026-05-04T09:00:00+08:00");
    private static final OffsetDateTime SLOT_END =
        OffsetDateTime.parse("2026-05-04T09:15:00+08:00");

    private final AppointmentModel2DTOConverter converter = new AppointmentModel2DTOConverter();

    @Test
    void slot_less_variant_returns_dto_with_null_slot_fields() {
        AppointmentModel m = AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null
        );

        AppointmentDTO dto = converter.convert(m);

        assertThat(dto.startAt()).isNull();
        assertThat(dto.endAt()).isNull();
        assertThat(dto.doctorId()).isNull();

        assertThat(dto.id()).isEqualTo(APPT_ID);
        assertThat(dto.slotId()).isEqualTo(SLOT_ID);
        assertThat(dto.patientId()).isEqualTo(PATIENT_ID);
        assertThat(dto.visitId()).isEqualTo(VISIT_ID);
        assertThat(dto.type()).isEqualTo("NEW_SYMPTOM");
        assertThat(dto.parentVisitId()).isNull();
        assertThat(dto.status()).isEqualTo("BOOKED");
        assertThat(dto.cancelledAt()).isNull();
    }

    @Test
    void joined_variant_fills_slot_fields() {
        AppointmentModel m = AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null
        );
        AppointmentSlotModel slot = AppointmentSlotModel.hydrate(
            SLOT_ID, DOCTOR_ID, SLOT_START, SLOT_END, SlotStatus.BOOKED
        );

        AppointmentDTO dto = converter.convert(m, slot);

        assertThat(dto.startAt()).isEqualTo(SLOT_START);
        assertThat(dto.endAt()).isEqualTo(SLOT_END);
        assertThat(dto.doctorId()).isEqualTo(DOCTOR_ID);

        assertThat(dto.id()).isEqualTo(APPT_ID);
        assertThat(dto.slotId()).isEqualTo(SLOT_ID);
        assertThat(dto.patientId()).isEqualTo(PATIENT_ID);
        assertThat(dto.visitId()).isEqualTo(VISIT_ID);
        assertThat(dto.type()).isEqualTo("NEW_SYMPTOM");
        assertThat(dto.status()).isEqualTo("BOOKED");
    }

    @Test
    void cancelled_appointment_has_cancelledAt_in_dto() {
        OffsetDateTime cancelledAt = OffsetDateTime.parse("2026-05-03T10:00:00+08:00");

        AppointmentModel m = AppointmentModel.hydrate(
            APPT_ID, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.CANCELLED, "Patient request", cancelledAt, CANCELLER_ID
        );

        AppointmentDTO dto = converter.convert(m);

        assertThat(dto.cancelledAt()).isEqualTo(cancelledAt);
        assertThat(dto.status()).isEqualTo("CANCELLED");
    }
}
