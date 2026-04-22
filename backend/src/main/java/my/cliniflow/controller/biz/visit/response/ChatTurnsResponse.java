package my.cliniflow.controller.biz.visit.response;

import java.util.List;

public record ChatTurnsResponse(List<ChatTurn> turns) {
    public record ChatTurn(
        int turnIndex,
        String role,
        String content,
        String toolCallName,  // nullable
        String createdAt      // ISO-8601; nullable
    ) {}
}
