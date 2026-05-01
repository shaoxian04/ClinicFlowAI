package my.cliniflow.infrastructure.notification.whatsapp;

import com.twilio.Twilio;
import com.twilio.exception.ApiException;
import com.twilio.rest.api.v2010.account.Message;
import com.twilio.type.PhoneNumber;
import my.cliniflow.infrastructure.notification.template.MessageTemplateRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Sends WhatsApp messages via Twilio's REST API in free-text mode.
 *
 * <p>Sandbox limitation: free-text bodies are only delivered if the recipient
 * messaged the sandbox number in the past 24 hours. For production, register
 * approved Content Templates in Twilio and switch to Content SID delivery.
 *
 * <p>Active when {@code cliniflow.whatsapp.provider=twilio}.
 */
@Component
@ConditionalOnProperty(prefix = "cliniflow.whatsapp", name = "provider", havingValue = "twilio")
public class TwilioWhatsAppSender implements WhatsAppSender {

    private static final Logger log = LoggerFactory.getLogger(TwilioWhatsAppSender.class);

    /** Twilio error codes that indicate a permanent failure — don't retry. */
    private static final Set<Integer> TERMINAL_CODES = Set.of(
        21211, // Invalid 'To' phone number
        21408, // Permission to send to that region not enabled
        21610, // Recipient opted out (STOP)
        21614, // 'To' is not a valid mobile number
        63016, // Failed to send freeform message because you are outside the allowed window
        63018, // Permission denied
        63032  // Channel disabled
    );

    private final String accountSid;
    private final String authToken;
    private final String fromWhatsApp;
    private final MessageTemplateRegistry templates;

    public TwilioWhatsAppSender(
            @Value("${cliniflow.whatsapp.twilio.account-sid:}") String accountSid,
            @Value("${cliniflow.whatsapp.twilio.auth-token:}") String authToken,
            @Value("${cliniflow.whatsapp.twilio.from-whatsapp:}") String fromWhatsApp,
            MessageTemplateRegistry templates) {
        this.accountSid = accountSid;
        this.authToken = authToken;
        this.fromWhatsApp = fromWhatsApp;
        this.templates = templates;
    }

    @PostConstruct
    void init() {
        if (accountSid == null || accountSid.isBlank()
            || authToken == null || authToken.isBlank()
            || fromWhatsApp == null || fromWhatsApp.isBlank()) {
            throw new IllegalStateException(
                "Twilio WhatsApp provider selected but credentials are missing. "
                + "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_WHATSAPP.");
        }
        Twilio.init(accountSid, authToken);
        log.info("[twilio-whatsapp] initialised with sender {}", fromWhatsApp);
    }

    @Override
    public SendResult send(WhatsAppPayload payload) {
        String body;
        try {
            body = renderBody(payload);
        } catch (RuntimeException ex) {
            log.error("[twilio-whatsapp] failed to render template {} locale {}: {}",
                payload.templateId(), payload.locale(), ex.toString());
            return new SendResult.Terminal(ex.getMessage(), "RENDER_FAILED");
        }

        String to = "whatsapp:" + payload.toPhoneE164();
        try {
            Message msg = Message.creator(
                    new PhoneNumber(to),
                    new PhoneNumber(fromWhatsApp),
                    body)
                .create();
            log.info("[twilio-whatsapp] sent template={} locale={} to={} sid={} status={}",
                payload.templateId(), payload.locale(),
                redactPhone(payload.toPhoneE164()), msg.getSid(), msg.getStatus());
            return new SendResult.Sent(msg.getSid());
        } catch (ApiException ex) {
            int code = ex.getCode() == null ? -1 : ex.getCode();
            String message = safe(ex.getMessage());
            if (TERMINAL_CODES.contains(code)) {
                log.warn("[twilio-whatsapp] terminal failure code={} to={} msg={}",
                    code, redactPhone(payload.toPhoneE164()), message);
                return new SendResult.Terminal(message, String.valueOf(code));
            }
            log.warn("[twilio-whatsapp] retryable failure code={} to={} msg={}",
                code, redactPhone(payload.toPhoneE164()), message);
            return new SendResult.Retryable("twilio:" + code + ":" + message);
        } catch (RuntimeException ex) {
            log.warn("[twilio-whatsapp] transport error to={}: {}",
                redactPhone(payload.toPhoneE164()), ex.toString());
            return new SendResult.Retryable("transport:" + ex.getClass().getSimpleName() + ":" + ex.getMessage());
        }
    }

    private String renderBody(WhatsAppPayload payload) {
        List<String> ordered = orderedVars(payload.templateId(), payload.vars());
        return templates.render(payload.templateId(), payload.locale(), ordered);
    }

    /**
     * Maps template-specific variable keys to the positional order expected by
     * {@link MessageTemplateRegistry#render}.
     */
    private static List<String> orderedVars(String templateId, Map<String, String> vars) {
        return switch (templateId) {
            case "appointment_confirmation_v1", "soap_followup_reminder_v1" -> List.of(
                vars.getOrDefault("patientName", "there"),
                vars.getOrDefault("doctorName", "your doctor"),
                vars.getOrDefault("date", ""),
                vars.getOrDefault("time", "")
            );
            case "appointment_cancelled_v1" -> List.of(
                vars.getOrDefault("patientName", "there"),
                vars.getOrDefault("doctorName", "your doctor"),
                vars.getOrDefault("date", "")
            );
            case "soap_meds_summary_v1" -> List.of(
                vars.getOrDefault("patientName", "there"),
                vars.getOrDefault("date", ""),
                vars.getOrDefault("medsSummary", "see portal for full list")
            );
            default -> throw new IllegalArgumentException("No variable ordering for template: " + templateId);
        };
    }

    private static String redactPhone(String e164) {
        if (e164 == null || e164.length() < 4) return "****";
        return "****" + e164.substring(e164.length() - 4);
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }
}
