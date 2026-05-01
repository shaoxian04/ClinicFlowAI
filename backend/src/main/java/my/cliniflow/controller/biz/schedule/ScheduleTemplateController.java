package my.cliniflow.controller.biz.schedule;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.schedule.ScheduleTemplateReadAppService;
import my.cliniflow.application.biz.schedule.ScheduleTemplateWriteAppService;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.schedule.request.ScheduleTemplateUpsertRequest;
import my.cliniflow.controller.biz.schedule.response.ScheduleTemplateDTO;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Admin-facing endpoints for managing the clinic's weekly schedule template.
 * All endpoints require {@code ROLE_ADMIN}.
 */
@RestController
@RequestMapping("/api/schedule/template")
@PreAuthorize("hasRole('ADMIN')")
public class ScheduleTemplateController {

    private final ScheduleTemplateReadAppService reads;
    private final ScheduleTemplateWriteAppService writes;

    public ScheduleTemplateController(ScheduleTemplateReadAppService reads,
                                      ScheduleTemplateWriteAppService writes) {
        this.reads = reads;
        this.writes = writes;
    }

    /**
     * Returns the current schedule template for the seeded doctor.
     * Responds with 404 if no template has been configured yet.
     */
    @GetMapping
    public WebResult<ScheduleTemplateDTO> get() {
        return WebResult.ok(reads.getCurrent()
            .orElseThrow(() -> new ResourceNotFoundException("no schedule template configured")));
    }

    /**
     * Creates or updates the schedule template and regenerates future slots.
     * Slot regeneration runs in the same transaction as the template upsert.
     */
    @PutMapping
    public WebResult<ScheduleTemplateDTO> upsert(
            @Valid @RequestBody ScheduleTemplateUpsertRequest req,
            Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(writes.upsert(userId, req));
    }
}
