package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.biz.previsit.response.PreVisitSessionResponse;

import java.util.UUID;

public interface PreVisitWriteAppService {

    PreVisitSessionResponse startSession(UUID patientId);

    PreVisitSessionResponse applyTurn(UUID visitId, String userMessage);
}
