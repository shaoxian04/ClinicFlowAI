package my.cliniflow.application.biz.schedule;

import my.cliniflow.controller.biz.schedule.request.ScheduleTemplateUpsertRequest;
import my.cliniflow.controller.biz.schedule.response.ScheduleTemplateDTO;

import java.util.UUID;

/**
 * Orchestrates schedule-template upsert + slot regeneration. Runs inside one
 * transaction so a partial template update cannot leave the slot grid stale.
 */
public interface ScheduleTemplateWriteAppService {

    ScheduleTemplateDTO upsert(UUID actorUserId, ScheduleTemplateUpsertRequest req);
}
