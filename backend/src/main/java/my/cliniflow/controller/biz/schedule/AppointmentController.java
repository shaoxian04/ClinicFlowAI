package my.cliniflow.controller.biz.schedule;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.schedule.AppointmentReadAppService;
import my.cliniflow.application.biz.schedule.AppointmentWriteAppService;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.schedule.request.AppointmentBookRequest;
import my.cliniflow.controller.biz.schedule.request.AppointmentCancelRequest;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.controller.biz.schedule.response.AvailabilityResponse;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.format.annotation.DateTimeFormat.ISO;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * Patient-facing appointment booking endpoints. Identity is derived from the
 * JWT principal in every method — never trust caller-supplied patient ids.
 */
@RestController
@RequestMapping("/api/appointments")
@PreAuthorize("hasRole('PATIENT')")
public class AppointmentController {

    private static final long MAX_RANGE_DAYS = 14;

    private final AppointmentReadAppService reads;
    private final AppointmentWriteAppService writes;

    public AppointmentController(AppointmentReadAppService reads, AppointmentWriteAppService writes) {
        this.reads = reads;
        this.writes = writes;
    }

    @GetMapping("/availability")
    public WebResult<AvailabilityResponse> availability(
            @RequestParam("from") @DateTimeFormat(iso = ISO.DATE) LocalDate from,
            @RequestParam("to")   @DateTimeFormat(iso = ISO.DATE) LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "to must be on/after from");
        }
        if (ChronoUnit.DAYS.between(from, to) > MAX_RANGE_DAYS) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                "max " + MAX_RANGE_DAYS + "-day range");
        }
        return WebResult.ok(reads.listAvailability(from, to));
    }

    @PostMapping
    public WebResult<UUID> book(@Valid @RequestBody AppointmentBookRequest req, Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        return WebResult.ok(writes.book(userId, req));
    }

    @GetMapping("/mine")
    public WebResult<List<AppointmentDTO>> mine(@RequestParam(required = false) String status,
                                                 Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        AppointmentStatus filter = null;
        if (status != null && !status.isBlank()) {
            try {
                filter = AppointmentStatus.valueOf(status);
            } catch (IllegalArgumentException ex) {
                throw new BusinessException(ResultCode.BAD_REQUEST,
                    "invalid status filter: " + status);
            }
        }
        return WebResult.ok(reads.listMine(userId, filter));
    }

    @DeleteMapping("/{id}")
    public WebResult<Void> cancel(@PathVariable UUID id,
                                   @RequestBody(required = false) AppointmentCancelRequest req,
                                   Authentication auth) {
        UUID userId = ((JwtService.Claims) auth.getPrincipal()).userId();
        writes.cancel(userId, id, req == null ? null : req.reason());
        return WebResult.ok(null);
    }
}
