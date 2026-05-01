package my.cliniflow.domain.biz.visit;

import my.cliniflow.domain.biz.visit.enums.FindingCategory;
import my.cliniflow.domain.biz.visit.enums.FindingSeverity;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EvaluatorFindingModelTest {

    @Test
    void unacknowledged_critical_is_blocking() {
        var f = newFinding(FindingSeverity.CRITICAL);
        assertThat(f.isUnacknowledgedCritical()).isTrue();
    }

    @Test
    void acknowledged_critical_is_not_blocking() {
        var f = newFinding(FindingSeverity.CRITICAL);
        f.acknowledge(UUID.randomUUID(), "noted");
        assertThat(f.isUnacknowledgedCritical()).isFalse();
    }

    @Test
    void cannot_acknowledge_superseded() {
        var f = newFinding(FindingSeverity.CRITICAL);
        f.markSuperseded();
        assertThatThrownBy(() -> f.acknowledge(UUID.randomUUID(), "x"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void acknowledge_idempotent() {
        var f = newFinding(FindingSeverity.CRITICAL);
        var doc = UUID.randomUUID();
        f.acknowledge(doc, "first");
        f.acknowledge(doc, "second");  // no-op second time
        assertThat(f.getAcknowledgementReason()).isEqualTo("first");
    }

    private EvaluatorFindingModel newFinding(FindingSeverity sev) {
        EvaluatorFindingModel f = new EvaluatorFindingModel();
        f.setId(UUID.randomUUID());
        f.setVisitId(UUID.randomUUID());
        f.setCategory(FindingCategory.DDI);
        f.setSeverity(sev);
        f.setMessage("test");
        return f;
    }
}
