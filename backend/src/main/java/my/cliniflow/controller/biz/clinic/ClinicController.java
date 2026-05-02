package my.cliniflow.controller.biz.clinic;

import my.cliniflow.application.biz.clinic.ClinicReadAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.domain.biz.clinic.info.ClinicInfo;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clinic")
public class ClinicController {
    private final ClinicReadAppService reads;

    public ClinicController(ClinicReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping
    public WebResult<ClinicInfo> get() {
        return WebResult.ok(reads.get());
    }
}
