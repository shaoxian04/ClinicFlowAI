package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.patient.PatientSeedDemoAppService;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse;
import my.cliniflow.controller.biz.patient.response.SeedDemoResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Doctor-facing patient data endpoints at /api/patients/{id}/...
 * Distinct from PatientController (/api/patient) which serves patient self-service.
 */
@RestController
@RequestMapping("/api/patients")
public class DoctorPatientController {

    private final PatientReadAppService reads;
    private final PatientSeedDemoAppService seed;

    public DoctorPatientController(PatientReadAppService reads, PatientSeedDemoAppService seed) {
        this.reads = reads;
        this.seed = seed;
    }

    @GetMapping("/{patientId}/context")
    public PatientContextResponse getContext(@PathVariable UUID patientId) {
        return reads.getContext(patientId);
    }

    @PostMapping("/context/seed-demo-all")
    public WebResult<SeedDemoResponse> seedDemoAll() {
        int n = seed.seedAll();
        return WebResult.ok(new SeedDemoResponse(n));
    }
}
