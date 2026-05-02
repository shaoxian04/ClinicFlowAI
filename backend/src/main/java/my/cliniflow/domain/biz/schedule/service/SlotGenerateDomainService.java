package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.model.ScheduleTemplateModel;

import java.time.OffsetDateTime;

/**
 * Domain service that eager-materialises appointment slots from a
 * {@link ScheduleTemplateModel}.
 */
public interface SlotGenerateDomainService {

    int generate(ScheduleTemplateModel tpl, OffsetDateTime now);
}
