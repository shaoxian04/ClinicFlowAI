package my.cliniflow.controller.biz.visit.converter;

import my.cliniflow.controller.biz.visit.response.EvaluatorFindingDTO;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;
import org.springframework.stereotype.Component;

@Component
public class EvaluatorFindingModel2DTOConverter {
    public EvaluatorFindingDTO convert(EvaluatorFindingModel m) {
        return new EvaluatorFindingDTO(
            m.getId(), m.getVisitId(),
            m.getCategory().name(), m.getSeverity().name(),
            m.getFieldPath(), m.getMessage(), m.getDetails(),
            m.getAcknowledgedAt(), m.getAcknowledgedBy(), m.getAcknowledgementReason(),
            m.getGmtCreate()
        );
    }
}
