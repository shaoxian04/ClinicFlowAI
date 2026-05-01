package my.cliniflow.domain.biz.visit;

import my.cliniflow.domain.biz.visit.enums.FindingCategory;
import my.cliniflow.domain.biz.visit.enums.FindingSeverity;
import my.cliniflow.domain.biz.visit.info.AcknowledgeFindingInfo;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import my.cliniflow.domain.biz.visit.repository.EvaluatorFindingRepository;
import my.cliniflow.domain.biz.visit.service.EvaluatorFindingAcknowledgeDomainService;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EvaluatorFindingAcknowledgeDomainServiceTest {

    @Test
    void acknowledge_marks_finding_and_persists() {
        EvaluatorFindingRepository repo = mock(EvaluatorFindingRepository.class);
        EvaluatorFindingModel f = makeCriticalFinding();
        when(repo.findById(f.getId())).thenReturn(Optional.of(f));
        when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        var svc = new EvaluatorFindingAcknowledgeDomainService(repo);
        UUID doctorId = UUID.randomUUID();
        var info = new AcknowledgeFindingInfo(f.getId(), doctorId, "noted");

        var result = svc.acknowledge(f.getVisitId(), info);

        assertThat(result.getAcknowledgedBy()).isEqualTo(doctorId);
        assertThat(result.getAcknowledgementReason()).isEqualTo("noted");
        verify(repo, times(1)).save(any());
    }

    @Test
    void acknowledge_visit_id_mismatch_throws() {
        EvaluatorFindingRepository repo = mock(EvaluatorFindingRepository.class);
        EvaluatorFindingModel f = makeCriticalFinding();
        when(repo.findById(f.getId())).thenReturn(Optional.of(f));

        var svc = new EvaluatorFindingAcknowledgeDomainService(repo);
        UUID otherVisit = UUID.randomUUID();
        var info = new AcknowledgeFindingInfo(f.getId(), UUID.randomUUID(), "x");

        assertThatThrownBy(() -> svc.acknowledge(otherVisit, info))
            .isInstanceOf(IllegalArgumentException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void acknowledge_unknown_finding_throws() {
        EvaluatorFindingRepository repo = mock(EvaluatorFindingRepository.class);
        when(repo.findById(any())).thenReturn(Optional.empty());

        var svc = new EvaluatorFindingAcknowledgeDomainService(repo);
        var info = new AcknowledgeFindingInfo(UUID.randomUUID(), UUID.randomUUID(), "x");
        assertThatThrownBy(() -> svc.acknowledge(UUID.randomUUID(), info))
            .isInstanceOf(IllegalArgumentException.class);
    }

    private EvaluatorFindingModel makeCriticalFinding() {
        EvaluatorFindingModel f = new EvaluatorFindingModel();
        f.setId(UUID.randomUUID());
        f.setVisitId(UUID.randomUUID());
        f.setCategory(FindingCategory.DDI);
        f.setSeverity(FindingSeverity.CRITICAL);
        f.setMessage("test");
        return f;
    }
}
