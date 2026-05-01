package my.cliniflow.controller.biz.dashboard;

import my.cliniflow.application.biz.dashboard.DoctorDashboardReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.dashboard.response.DoctorDashboardResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctor/dashboard")
@PreAuthorize("hasRole('DOCTOR')")
public class DoctorDashboardController {

    private final DoctorDashboardReadAppService reads;

    public DoctorDashboardController(DoctorDashboardReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping
    public WebResult<DoctorDashboardResponse> get() {
        return WebResult.ok(reads.build());
    }
}
