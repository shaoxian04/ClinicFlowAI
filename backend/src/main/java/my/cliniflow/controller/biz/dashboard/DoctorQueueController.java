package my.cliniflow.controller.biz.dashboard;

import my.cliniflow.application.biz.dashboard.DoctorQueueReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.dashboard.response.DoctorQueueResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctor/queue")
@PreAuthorize("hasRole('DOCTOR')")
public class DoctorQueueController {

    private final DoctorQueueReadAppService reads;

    public DoctorQueueController(DoctorQueueReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping
    public WebResult<DoctorQueueResponse> get() {
        return WebResult.ok(reads.build());
    }
}
