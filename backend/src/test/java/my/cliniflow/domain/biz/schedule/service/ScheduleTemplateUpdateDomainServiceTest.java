package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.info.WeeklyHours;
import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;
import my.cliniflow.domain.biz.schedule.repository.ScheduleTemplateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ScheduleTemplateUpdateDomainServiceTest {

    static final UUID DOCTOR_ID   = UUID.fromString("00000000-0000-0000-0000-000000000b01");
    static final UUID EXISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000b02");

    static final LocalDate DATE_A = LocalDate.of(2026, 1, 1);
    static final LocalDate DATE_B = LocalDate.of(2026, 6, 1);

    static final short SLOT_MINUTES = 15;
    static final short CANCEL_LEAD  = 2;
    static final short HORIZON_DAYS = 30;
    static final WeeklyHours WEEKLY = new WeeklyHours(Map.of());

    ScheduleTemplateRepository templates;
    ScheduleTemplateUpdateDomainService svc;

    @BeforeEach
    void setUp() {
        templates = mock(ScheduleTemplateRepository.class);
        svc = new ScheduleTemplateUpdateDomainServiceImpl(templates);
    }

    private ScheduleTemplateModel existingTemplate(LocalDate effectiveFrom) {
        return ScheduleTemplateModel.hydrate(
            EXISTING_ID, DOCTOR_ID, effectiveFrom,
            SLOT_MINUTES, WEEKLY, CANCEL_LEAD, HORIZON_DAYS);
    }

    @Test
    void creates_new_template_when_none_exists() {
        when(templates.findCurrentForDoctor(DOCTOR_ID)).thenReturn(Optional.empty());
        when(templates.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<ScheduleTemplateModel> captor =
            ArgumentCaptor.forClass(ScheduleTemplateModel.class);

        svc.upsert(DOCTOR_ID, DATE_A, SLOT_MINUTES, WEEKLY, CANCEL_LEAD, HORIZON_DAYS);

        verify(templates).save(captor.capture());
        ScheduleTemplateModel saved = captor.getValue();
        assertThat(saved.getId()).isNull();
        assertThat(saved.getDoctorId()).isEqualTo(DOCTOR_ID);
        assertThat(saved.getEffectiveFrom()).isEqualTo(DATE_A);
    }

    @Test
    void updates_existing_template_when_effectiveFrom_matches() {
        ScheduleTemplateModel existing = existingTemplate(DATE_A);
        when(templates.findCurrentForDoctor(DOCTOR_ID)).thenReturn(Optional.of(existing));
        when(templates.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<ScheduleTemplateModel> captor =
            ArgumentCaptor.forClass(ScheduleTemplateModel.class);

        svc.upsert(DOCTOR_ID, DATE_A, SLOT_MINUTES, WEEKLY, CANCEL_LEAD, HORIZON_DAYS);

        verify(templates).save(captor.capture());
        ScheduleTemplateModel saved = captor.getValue();
        assertThat(saved.getId()).isEqualTo(EXISTING_ID);
        assertThat(saved.getEffectiveFrom()).isEqualTo(DATE_A);
    }

    @Test
    void creates_new_template_when_effectiveFrom_differs() {
        ScheduleTemplateModel existing = existingTemplate(DATE_A);
        when(templates.findCurrentForDoctor(DOCTOR_ID)).thenReturn(Optional.of(existing));
        when(templates.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ArgumentCaptor<ScheduleTemplateModel> captor =
            ArgumentCaptor.forClass(ScheduleTemplateModel.class);

        // Request uses DATE_B which differs from existing DATE_A
        svc.upsert(DOCTOR_ID, DATE_B, SLOT_MINUTES, WEEKLY, CANCEL_LEAD, HORIZON_DAYS);

        verify(templates).save(captor.capture());
        ScheduleTemplateModel saved = captor.getValue();
        assertThat(saved.getId()).isNull();
        assertThat(saved.getEffectiveFrom()).isEqualTo(DATE_B);
    }
}
