package my.cliniflow.application.biz.schedule;

import my.cliniflow.controller.biz.schedule.response.ScheduleTemplateDTO;

import java.util.Optional;

/**
 * Read-side application service for schedule templates.
 * Returns the most-recently-effective template for the single seeded doctor.
 */
public interface ScheduleTemplateReadAppService {

    Optional<ScheduleTemplateDTO> getCurrent();
}
