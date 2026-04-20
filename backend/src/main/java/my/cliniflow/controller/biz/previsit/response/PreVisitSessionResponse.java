package my.cliniflow.controller.biz.previsit.response;

import java.util.Map;
import java.util.UUID;

public record PreVisitSessionResponse(
    UUID visitId,
    String assistantMessage,
    Map<String, Object> structured,
    boolean done
) {}
