package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.biz.previsit.response.PreVisitSessionResponse;
import my.cliniflow.domain.biz.visit.enums.VisitStatus;
import my.cliniflow.domain.biz.visit.model.PreVisitReportModel;
import my.cliniflow.domain.biz.visit.model.VisitModel;
import my.cliniflow.domain.biz.visit.repository.VisitRepository;
import my.cliniflow.domain.biz.visit.service.ReferenceNumberDomainService;
import my.cliniflow.infrastructure.client.AgentServiceClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.*;

@Service
public class PreVisitWriteAppServiceImpl implements PreVisitWriteAppService {

    private final VisitRepository visits;
    private final AgentServiceClient agent;
    private final ReferenceNumberDomainService refNumbers;
    private final UUID seededDoctorId;

    public PreVisitWriteAppServiceImpl(
        VisitRepository visits,
        AgentServiceClient agent,
        ReferenceNumberDomainService refNumbers,
        @Value("${cliniflow.dev.seeded-doctor-id}") String seededDoctorId
    ) {
        this.visits = visits;
        this.agent = agent;
        this.refNumbers = refNumbers;
        this.seededDoctorId = UUID.fromString(seededDoctorId);
    }

    @Override
    @Transactional
    public PreVisitSessionResponse startSession(UUID patientId) {
        VisitModel v = new VisitModel();
        v.setPatientId(patientId);
        v.setDoctorId(seededDoctorId);
        v.setStatus(VisitStatus.IN_PROGRESS);
        v.setStartedAt(OffsetDateTime.now());
        if (v.getReferenceNumber() == null) {
            v.setReferenceNumber(refNumbers.nextFor(LocalDate.now()));
        }

        PreVisitReportModel r = new PreVisitReportModel();
        Map<String, Object> initial = new HashMap<>();
        initial.put("history", new ArrayList<Map<String, String>>());
        initial.put("fields", new HashMap<String, Object>());
        initial.put("done", false);
        r.setStructured(initial);
        v.setPreVisitReport(r);

        v = visits.save(v);

        String first = "Hi! I'm your pre-visit assistant. What's the main reason for your visit today?";
        appendHistory(r, "assistant", first);
        visits.save(v);

        return new PreVisitSessionResponse(v.getId(), first, r.getStructured(), false);
    }

    @Override
    @Transactional
    public PreVisitSessionResponse applyTurn(UUID visitId, String userMessage) {
        VisitModel v = visits.findById(visitId).orElseThrow(
            () -> new IllegalArgumentException("visit not found: " + visitId));
        PreVisitReportModel r = v.getPreVisitReport();
        if (r == null) throw new IllegalStateException("visit has no pre-visit report: " + visitId);
        if (Boolean.TRUE.equals(r.getStructured().get("done"))) {
            throw new IllegalStateException("pre-visit already complete");
        }

        appendHistory(r, "user", userMessage);

        AgentServiceClient.PreVisitTurnResult result = agent.callPreVisitTurn(
            v.getId(), v.getPatientId(), userMessage
        );

        appendHistory(r, "assistant", result.assistantMessage());
        r.getStructured().put("fields", result.fields());
        r.getStructured().put("done", result.done());

        visits.save(v);
        return new PreVisitSessionResponse(v.getId(), result.assistantMessage(), r.getStructured(), result.done());
    }

    @SuppressWarnings("unchecked")
    private void appendHistory(PreVisitReportModel r, String role, String content) {
        List<Map<String, String>> history = (List<Map<String, String>>) r.getStructured()
            .computeIfAbsent("history", k -> new ArrayList<Map<String, String>>());
        history.add(Map.of("role", role, "content", content));
    }
}
