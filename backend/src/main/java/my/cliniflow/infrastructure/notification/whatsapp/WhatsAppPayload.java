package my.cliniflow.infrastructure.notification.whatsapp;

import java.util.Map;

public record WhatsAppPayload(String toPhoneE164,
                               String templateId,
                               String locale,
                               Map<String, String> vars) {}
