package my.cliniflow.domain.biz.visit.service;

import my.cliniflow.domain.biz.visit.info.AcknowledgeFindingInfo;
import my.cliniflow.domain.biz.visit.model.EvaluatorFindingModel;

import java.util.UUID;

public interface EvaluatorFindingAcknowledgeDomainService {

    EvaluatorFindingModel acknowledge(UUID visitId, AcknowledgeFindingInfo info);
}
