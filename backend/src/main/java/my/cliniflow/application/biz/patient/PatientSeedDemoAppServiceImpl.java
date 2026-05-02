package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.UpstreamException;
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
public class PatientSeedDemoAppServiceImpl implements PatientSeedDemoAppService {
    private static final Logger log = LoggerFactory.getLogger(PatientSeedDemoAppServiceImpl.class);

    private final PatientRepository patients;
    private final AgentServiceClient agent;
    private final boolean enabled;

    public PatientSeedDemoAppServiceImpl(
        PatientRepository patients,
        AgentServiceClient agent,
        @Value("${cliniflow.dev.seed-demo-enabled:false}") boolean enabled
    ) {
        this.patients = patients;
        this.agent = agent;
        this.enabled = enabled;
    }

    @Override
    public boolean isEnabled() { return enabled; }

    @Override
    public int seedAll() {
        if (!enabled) {
            throw new BusinessException(ResultCode.FORBIDDEN, "demo seeding disabled in this environment");
        }
        var page = patients.findAll(org.springframework.data.domain.PageRequest.of(0, 2_000));
        if (page.getTotalElements() > 2_000) {
            log.warn("[SEED] patient table has {} rows; only seeding first 2000", page.getTotalElements());
        }
        var all = page.stream().map(this::toSeedPatient).toList();
        log.info("[SEED] sending {} patients to agent", all.size());
        try {
            var resp = agent.seedDemoBulk(new SeedDemoBulkRequest(all));
            return resp.seeded();
        } catch (UpstreamException e) {
            log.error("[SEED] agent bulk seed failed: {}", e.getMessage());
            throw e;
        }
    }

    private SeedDemoPatient toSeedPatient(PatientModel p) {
        String dob = p.getDateOfBirth() != null
            ? p.getDateOfBirth().format(DateTimeFormatter.ISO_LOCAL_DATE)
            : null;
        // gender is stored as a raw String (e.g. "MALE", "FEMALE"), not an enum
        return new SeedDemoPatient(p.getId().toString(), p.getFullName(), dob, p.getGender());
    }
}
