package my.cliniflow.domain.biz.visit.service;

import my.cliniflow.domain.biz.visit.info.AcknowledgeFindingInfo;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import my.cliniflow.domain.biz.visit.repository.EvaluatorFindingRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class EvaluatorFindingAcknowledgeDomainServiceImpl implements EvaluatorFindingAcknowledgeDomainService {

    private final EvaluatorFindingRepository repository;

    public EvaluatorFindingAcknowledgeDomainServiceImpl(EvaluatorFindingRepository repository) {
        this.repository = repository;
    }

    @Override
    public EvaluatorFindingModel acknowledge(UUID visitId, AcknowledgeFindingInfo info) {
        EvaluatorFindingModel finding = repository.findById(info.findingId())
            .orElseThrow(() -> new IllegalArgumentException(
                "finding not found: " + info.findingId()));
        if (!finding.getVisitId().equals(visitId)) {
            throw new IllegalArgumentException(
                "finding " + info.findingId() + " does not belong to visit " + visitId);
        }
        finding.acknowledge(info.doctorId(), info.reason());
        return repository.save(finding);
    }
}
