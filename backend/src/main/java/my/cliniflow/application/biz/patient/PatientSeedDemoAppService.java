package my.cliniflow.application.biz.patient;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import my.cliniflow.infrastructure.client.AgentServiceClient.SeedDemoBulkRequest;
import my.cliniflow.infrastructure.client.AgentServiceClient.SeedDemoBulkRequest.SeedDemoPatient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;

@Service
public class PatientSeedDemoAppService {
    private static final Logger log = LoggerFactory.getLogger(PatientSeedDemoAppService.class);

    private final PatientRepository patients;
    private final AgentServiceClient agent;
    private final boolean enabled;

    public PatientSeedDemoAppService(
        PatientRepository patients,
        AgentServiceClient agent,
        @Value("${cliniflow.dev.seed-demo-enabled:false}") boolean enabled
    ) {
        this.patients = patients;
        this.agent = agent;
        this.enabled = enabled;
    }

    public boolean isEnabled() { return enabled; }

    public int seedAll() {
        if (!enabled) {
            throw new IllegalStateException("demo seeding disabled");
        }
        var all = patients.findAll().stream()
            .map(this::toSeedPatient)
            .toList();
        log.info("[SEED] sending {} patients to agent", all.size());
        var resp = agent.seedDemoBulk(new SeedDemoBulkRequest(all));
        return resp.seeded();
    }

    private SeedDemoPatient toSeedPatient(PatientModel p) {
        String dob = p.getDateOfBirth() != null
            ? p.getDateOfBirth().format(DateTimeFormatter.ISO_LOCAL_DATE)
            : null;
        // gender is stored as a raw String (e.g. "MALE", "FEMALE"), not an enum
        return new SeedDemoPatient(p.getId().toString(), p.getFullName(), dob, p.getGender());
    }
}
