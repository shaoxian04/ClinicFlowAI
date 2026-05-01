package my.cliniflow.infrastructure.notification.template;

public record MessageTemplate(String id, String locale, String body, int variableCount) {}
