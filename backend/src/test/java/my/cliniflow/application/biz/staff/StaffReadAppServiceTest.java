package my.cliniflow.application.biz.staff;

import my.cliniflow.application.biz.schedule.AppointmentNameResolver;
import my.cliniflow.controller.biz.staff.response.WaitingEntryDTO;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.visit.repository.PreVisitReportRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StaffReadAppServiceTest {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    @Mock AppointmentSlotRepository slots;
    @Mock AppointmentRepository appts;
    @Mock PreVisitReportRepository preVisitReports;
    @Mock AppointmentNameResolver nameResolver;

    StaffReadAppService svc;

    @BeforeEach
    void setUp() {
        svc = new StaffReadAppService(slots, appts, preVisitReports, nameResolver);
    }

    @Test
    void todayReturnsEmptyListWhenNoSlots() {
        LocalDate today = LocalDate.of(2026, 5, 2);
        when(slots.findByStartAtBetween(any(), any())).thenReturn(List.of());

        List<WaitingEntryDTO> result = svc.today(today, KL);

        assertThat(result).isEmpty();
    }

    @Test
    void todayReturnsTwoEntriesWithMixedPreVisitStatus() {
        LocalDate today = LocalDate.of(2026, 5, 2);
        OffsetDateTime slot1Start = today.atTime(9, 0).atZone(KL).toOffsetDateTime();
        OffsetDateTime slot1End   = today.atTime(9, 15).atZone(KL).toOffsetDateTime();
        OffsetDateTime slot2Start = today.atTime(9, 30).atZone(KL).toOffsetDateTime();
        OffsetDateTime slot2End   = today.atTime(9, 45).atZone(KL).toOffsetDateTime();

        UUID slot1Id = UUID.randomUUID();
        UUID slot2Id = UUID.randomUUID();
        UUID doctorId = UUID.randomUUID();
        UUID patient1 = UUID.randomUUID();
        UUID patient2 = UUID.randomUUID();
        UUID visit1 = UUID.randomUUID();
        UUID visit2 = UUID.randomUUID();
        UUID appt1Id = UUID.randomUUID();
        UUID appt2Id = UUID.randomUUID();

        AppointmentSlotModel slot1 = AppointmentSlotModel.hydrate(
            slot1Id, doctorId, slot1Start, slot1End, SlotStatus.BOOKED);
        AppointmentSlotModel slot2 = AppointmentSlotModel.hydrate(
            slot2Id, doctorId, slot2Start, slot2End, SlotStatus.BOOKED);

        AppointmentModel appt1 = AppointmentModel.hydrate(
            appt1Id, slot1Id, patient1, visit1, AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.BOOKED, null, null, null, null);
        AppointmentModel appt2 = AppointmentModel.hydrate(
            appt2Id, slot2Id, patient2, visit2, AppointmentType.FOLLOW_UP, UUID.randomUUID(),
            AppointmentStatus.BOOKED, null, null, null, null);

        when(slots.findByStartAtBetween(any(), any())).thenReturn(List.of(slot1, slot2));
        when(appts.findBySlotIdInAndStatusIn(anyCollection(), anyCollection()))
            .thenReturn(List.of(appt1, appt2));
        // Only visit2 has a pre-visit report submitted.
        when(preVisitReports.findVisitIdsIn(anyCollection()))
            .thenReturn(List.of(visit2));
        when(nameResolver.patientNames(anyList()))
            .thenReturn(Map.of(patient1, "Alice Tan", patient2, "Bob Lee"));
        when(nameResolver.doctorName(doctorId)).thenReturn("Dr. Demo");

        List<WaitingEntryDTO> result = svc.today(today, KL);

        assertThat(result).hasSize(2);

        WaitingEntryDTO e1 = result.stream()
            .filter(w -> w.appointmentId().equals(appt1Id))
            .findFirst().orElseThrow();
        assertThat(e1.patientName()).isEqualTo("Alice Tan");
        assertThat(e1.preVisitStatus()).isEqualTo("none");
        assertThat(e1.checkedIn()).isFalse();
        assertThat(e1.arrivedAt()).isNull();
        assertThat(e1.slotStartAt()).isEqualTo(slot1Start.toString());
        assertThat(e1.type()).isEqualTo("NEW_SYMPTOM");
        assertThat(e1.doctorName()).isEqualTo("Dr. Demo");

        WaitingEntryDTO e2 = result.stream()
            .filter(w -> w.appointmentId().equals(appt2Id))
            .findFirst().orElseThrow();
        assertThat(e2.patientName()).isEqualTo("Bob Lee");
        assertThat(e2.preVisitStatus()).isEqualTo("submitted");
        assertThat(e2.checkedIn()).isFalse();
        assertThat(e2.type()).isEqualTo("FOLLOW_UP");
    }

    @Test
    void checkedInStatusReflectsCheckedInFlagAndArrivedAt() {
        LocalDate today = LocalDate.of(2026, 5, 2);
        OffsetDateTime slotStart = today.atTime(10, 0).atZone(KL).toOffsetDateTime();
        OffsetDateTime slotEnd   = today.atTime(10, 15).atZone(KL).toOffsetDateTime();
        OffsetDateTime arrivedAt = today.atTime(9, 55).atZone(KL).toOffsetDateTime();

        UUID slotId = UUID.randomUUID();
        UUID doctorId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        UUID visitId = UUID.randomUUID();
        UUID apptId = UUID.randomUUID();

        AppointmentSlotModel slot = AppointmentSlotModel.hydrate(
            slotId, doctorId, slotStart, slotEnd, SlotStatus.BOOKED);
        AppointmentModel appt = AppointmentModel.hydrate(
            apptId, slotId, patientId, visitId, AppointmentType.NEW_SYMPTOM, null,
            AppointmentStatus.CHECKED_IN, null, null, null, arrivedAt);

        when(slots.findByStartAtBetween(any(), any())).thenReturn(List.of(slot));
        when(appts.findBySlotIdInAndStatusIn(anyCollection(), anyCollection()))
            .thenReturn(List.of(appt));
        when(preVisitReports.findVisitIdsIn(anyCollection())).thenReturn(List.of());
        when(nameResolver.patientNames(anyList()))
            .thenReturn(Map.of(patientId, "Carol Lim"));
        when(nameResolver.doctorName(doctorId)).thenReturn("Dr. Demo");

        List<WaitingEntryDTO> result = svc.today(today, KL);

        assertThat(result).hasSize(1);
        WaitingEntryDTO w = result.get(0);
        assertThat(w.checkedIn()).isTrue();
        assertThat(w.arrivedAt()).isEqualTo(arrivedAt.toString());
        assertThat(w.preVisitStatus()).isEqualTo("none");
    }
}
