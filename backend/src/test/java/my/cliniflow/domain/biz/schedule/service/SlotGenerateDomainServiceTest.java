package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleDayOverrideModel;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.repository.ScheduleDayOverrideRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SlotGenerateDomainServiceTest {

    static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");
    static final UUID USER = UUID.fromString("00000000-0000-0000-0000-000000000001");

    AppointmentSlotRepository slotRepo;
    ScheduleDayOverrideRepository overrideRepo;
    SlotGenerateDomainService svc;
    UUID doctorId;

    @BeforeEach
    void setUp() {
        slotRepo = mock(AppointmentSlotRepository.class);
        overrideRepo = mock(ScheduleDayOverrideRepository.class);
        svc = new SlotGenerateDomainService(slotRepo, overrideRepo);
        doctorId = UUID.randomUUID();
        when(slotRepo.deleteFutureAvailable(eq(doctorId), any())).thenReturn(0);
        when(slotRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    /**
     * Simulates a Sunday-evening generation (KL time) for a Monday-09:00..10:00
     * working window, 15-minute slots, 1-day horizon → expects 4 slots.
     */
    @Test
    void generates_15min_slots_for_one_day_when_template_says_mon_only() {
        ScheduleTemplateModel tpl = ScheduleTemplateModel.create(
            doctorId,
            LocalDate.of(2026, 5, 4),
            (short) 15,
            WeeklyHours.fromJson(Map.of("MON", List.of(List.of("09:00", "10:00")))),
            (short) 2,
            (short) 1);

        when(overrideRepo.findByDoctorAndDate(eq(doctorId), any())).thenReturn(List.of());

        // 'now' = 2026-05-04 00:00 KL → today_KL = May 4 (Monday) → horizon=1 covers only May 4
        OffsetDateTime now = ZonedDateTime.of(2026, 5, 4, 0, 0, 0, 0, KL).toOffsetDateTime();

        int inserted = svc.generate(tpl, now);

        assertThat(inserted).isEqualTo(4); // 09:00, 09:15, 09:30, 09:45
        verify(slotRepo, times(4)).save(any());
    }

    @Test
    void skips_closed_days() {
        ScheduleTemplateModel tpl = ScheduleTemplateModel.create(
            doctorId,
            LocalDate.of(2026, 5, 4),
            (short) 15,
            WeeklyHours.fromJson(Map.of("MON", List.of(List.of("09:00", "10:00")))),
            (short) 2,
            (short) 1);

        ScheduleDayOverrideModel closed = ScheduleDayOverrideModel.closeDay(
            doctorId, LocalDate.of(2026, 5, 4), "public-holiday", USER);
        when(overrideRepo.findByDoctorAndDate(eq(doctorId), eq(LocalDate.of(2026, 5, 4))))
            .thenReturn(List.of(closed));

        OffsetDateTime now = ZonedDateTime.of(2026, 5, 4, 0, 0, 0, 0, KL).toOffsetDateTime();

        int inserted = svc.generate(tpl, now);

        assertThat(inserted).isZero();
        verify(slotRepo, times(0)).save(any());
    }

    @Test
    void skips_blocked_windows() {
        ScheduleTemplateModel tpl = ScheduleTemplateModel.create(
            doctorId,
            LocalDate.of(2026, 5, 4),
            (short) 15,
            WeeklyHours.fromJson(Map.of("MON", List.of(List.of("09:00", "10:00")))),
            (short) 2,
            (short) 1);

        ScheduleDayOverrideModel blocked = ScheduleDayOverrideModel.blockWindow(
            doctorId, LocalDate.of(2026, 5, 4),
            LocalTime.of(9, 30), LocalTime.of(10, 0),
            "lunch", USER);
        when(overrideRepo.findByDoctorAndDate(eq(doctorId), eq(LocalDate.of(2026, 5, 4))))
            .thenReturn(List.of(blocked));

        OffsetDateTime now = ZonedDateTime.of(2026, 5, 4, 0, 0, 0, 0, KL).toOffsetDateTime();

        int inserted = svc.generate(tpl, now);

        assertThat(inserted).isEqualTo(2); // only 09:00 and 09:15 survive
        verify(slotRepo, times(2)).save(any());
    }
}
