package my.cliniflow.controller.biz.patient;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.controller.biz.patient.response.PatientContextResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    public DoctorPatientController(PatientReadAppService reads) {
        this.reads = reads;
    }

    @GetMapping("/{patientId}/context")
    public PatientContextResponse getContext(@PathVariable UUID patientId) {
        return reads.getContext(patientId);
    }
}
