package my.cliniflow.infrastructure.notification.whatsapp;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Logs the outgoing WhatsApp message and returns a synthetic Twilio SID.
 * Active when {@code cliniflow.whatsapp.provider=stub} (default in tests +
 * dev environments without Twilio credentials).
 */
@Component
@ConditionalOnProperty(prefix = "cliniflow.whatsapp", name = "provider",
                        havingValue = "stub", matchIfMissing = true)
public class StubWhatsAppSender implements WhatsAppSender {

    private static final Logger log = LoggerFactory.getLogger(StubWhatsAppSender.class);

    @Override
    public SendResult send(WhatsAppPayload payload) {
        log.info("[stub-whatsapp] would send template={} locale={} to={} vars={}",
            payload.templateId(), payload.locale(),
            redactPhone(payload.toPhoneE164()), payload.vars());
        return new SendResult.Sent("stub-sid-" + UUID.randomUUID());
    }

    /** Phone numbers are PII; log only the last 4 digits. */
    private static String redactPhone(String e164) {
        if (e164 == null || e164.length() < 4) return "****";
        return "****" + e164.substring(e164.length() - 4);
    }
}
