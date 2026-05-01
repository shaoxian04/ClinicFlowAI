package my.cliniflow.domain.biz.schedule.model;

import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class AppointmentModelTest {

    static final UUID SLOT_ID    = UUID.fromString("00000000-0000-0000-0000-000000000a01");
    static final UUID PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000a02");
    static final UUID VISIT_ID   = UUID.fromString("00000000-0000-0000-0000-000000000a03");
    static final UUID PARENT_ID  = UUID.fromString("00000000-0000-0000-0000-000000000a04");
    static final UUID USER_ID    = UUID.fromString("00000000-0000-0000-0000-000000000a05");

    @Test
    void book_new_symptom_creates_booked_appointment() {
        AppointmentModel a = AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null);
        assertThat(a.getStatus()).isEqualTo(AppointmentStatus.BOOKED);
        assertThat(a.getSlotId()).isEqualTo(SLOT_ID);
        assertThat(a.getPatientId()).isEqualTo(PATIENT_ID);
        assertThat(a.getVisitId()).isEqualTo(VISIT_ID);
        assertThat(a.getType()).isEqualTo(AppointmentType.NEW_SYMPTOM);
        assertThat(a.getParentVisitId()).isNull();
    }

    @Test
    void book_followup_requires_parent_visit() {
        assertThatThrownBy(() -> AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.FOLLOW_UP, null))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("parent_visit_id required for FOLLOW_UP");
    }

    @Test
    void book_new_symptom_rejects_parent_visit() {
        assertThatThrownBy(() -> AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, PARENT_ID))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("parent_visit_id only allowed for FOLLOW_UP");
    }

    @Test
    void cancel_sets_status_and_metadata() {
        AppointmentModel a = AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null);
        OffsetDateTime now = OffsetDateTime.parse("2026-05-04T08:00:00+08:00");
        a.cancel("patient-changed-mind", USER_ID, now);
        assertThat(a.getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(a.getCancelReason()).isEqualTo("patient-changed-mind");
        assertThat(a.getCancelledBy()).isEqualTo(USER_ID);
        assertThat(a.getCancelledAt()).isEqualTo(now);
    }

    @Test
    void cancel_throws_when_already_cancelled() {
        AppointmentModel a = AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null);
        a.cancel("first", USER_ID, OffsetDateTime.now());
        assertThatThrownBy(() -> a.cancel("again", USER_ID, OffsetDateTime.now()))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void mark_no_show_only_from_booked() {
        AppointmentModel a = AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null);
        a.markNoShow();
        assertThat(a.getStatus()).isEqualTo(AppointmentStatus.NO_SHOW);
    }

    @Test
    void mark_completed_only_from_booked() {
        AppointmentModel a = AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null);
        a.markCompleted();
        assertThat(a.getStatus()).isEqualTo(AppointmentStatus.COMPLETED);
    }

    @Test
    void mark_completed_throws_after_cancel() {
        AppointmentModel a = AppointmentModel.book(SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.NEW_SYMPTOM, null);
        a.cancel("x", USER_ID, OffsetDateTime.now());
        assertThatThrownBy(a::markCompleted).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void hydrate_reconstructs_full_state() {
        OffsetDateTime cancelledAt = OffsetDateTime.parse("2026-05-04T08:00:00+08:00");
        UUID id = UUID.randomUUID();
        AppointmentModel a = AppointmentModel.hydrate(id, SLOT_ID, PATIENT_ID, VISIT_ID,
            AppointmentType.FOLLOW_UP, PARENT_ID, AppointmentStatus.CANCELLED,
            "no-show", cancelledAt, USER_ID);
        assertThat(a.getId()).isEqualTo(id);
        assertThat(a.getStatus()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(a.getCancelReason()).isEqualTo("no-show");
        assertThat(a.getParentVisitId()).isEqualTo(PARENT_ID);
    }
}
