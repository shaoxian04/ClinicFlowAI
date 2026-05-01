package my.cliniflow.infrastructure.notification.whatsapp;

import my.cliniflow.infrastructure.notification.template.MessageTemplateRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import jakarta.annotation.PostConstruct;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Sends WhatsApp messages via the Meta Cloud API (Graph API).
 *
 * <p>Routing: each internal {@link WhatsAppPayload#templateId()} maps to a
 * Meta-approved template name via {@code cliniflow.whatsapp.meta-cloud.template-names.*}.
 * The internal {@link WhatsAppPayload#locale()} (en/ms/zh) maps to a Meta
 * language code via {@code cliniflow.whatsapp.meta-cloud.language-codes.*}
 * (e.g. en→en_US, ms→ms, zh→zh_CN). Unmapped ids fall back to
 * {@code default-template-name} (defaults to {@code hello_world}, which is
 * Meta's pre-approved no-variable template — safe before any custom templates
 * are approved).
 *
 * <p>Active when {@code cliniflow.whatsapp.provider=meta-cloud}.
 */
@Component
@ConditionalOnProperty(prefix = "cliniflow.whatsapp", name = "provider", havingValue = "meta-cloud")
public class MetaCloudWhatsAppSender implements WhatsAppSender {

    private static final Logger log = LoggerFactory.getLogger(MetaCloudWhatsAppSender.class);

    /**
     * Meta Cloud API error codes that indicate a permanent failure — don't retry.
     * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
     */
    private static final Set<Integer> TERMINAL_CODES = Set.of(
        131005,  // Access denied (token lacks permission)
        131008,  // Required parameter missing
        131009,  // Parameter value invalid
        131021,  // Recipient cannot be sender
        131026,  // Message undeliverable (recipient not on WhatsApp / opted out)
        131031,  // Account locked
        131047,  // Re-engagement message — outside 24h window without template
        131051,  // Unsupported message type
        132000,  // Number of parameters does not match expected number of params
        132001,  // Template does not exist (or not approved in this language)
        132005,  // Translated text too long
        132007,  // Template format character policy violated
        132012,  // Parameter format does not match format in the created template
        132015   // Template is paused due to low quality
    );

    private final String phoneNumberId;
    private final String accessToken;
    private final String apiVersion;
    private final String defaultTemplateName;
    private final String defaultTemplateLanguage;
    private final Map<String, String> templateNames;   // internal id -> Meta template name
    private final Map<String, String> languageCodes;   // internal locale -> Meta language code
    private final MessageTemplateRegistry templates;
    private WebClient client;

    public MetaCloudWhatsAppSender(
            @Value("${cliniflow.whatsapp.meta-cloud.phone-number-id:}") String phoneNumberId,
            @Value("${cliniflow.whatsapp.meta-cloud.access-token:}") String accessToken,
            @Value("${cliniflow.whatsapp.meta-cloud.api-version:v21.0}") String apiVersion,
            @Value("${cliniflow.whatsapp.meta-cloud.default-template-name:hello_world}") String defaultTemplateName,
            @Value("${cliniflow.whatsapp.meta-cloud.default-template-language:en_US}") String defaultTemplateLanguage,
            @Value("#{${cliniflow.whatsapp.meta-cloud.template-names:{:}}}") Map<String, String> templateNames,
            @Value("#{${cliniflow.whatsapp.meta-cloud.language-codes:{en:'en_US',ms:'ms',zh:'zh_CN'}}}") Map<String, String> languageCodes,
            MessageTemplateRegistry templates) {
        this.phoneNumberId = phoneNumberId;
        this.accessToken = accessToken;
        this.apiVersion = apiVersion;
        this.defaultTemplateName = defaultTemplateName;
        this.defaultTemplateLanguage = defaultTemplateLanguage;
        this.templateNames = templateNames == null ? Map.of() : templateNames;
        this.languageCodes = languageCodes == null ? Map.of() : languageCodes;
        this.templates = templates;
    }

    @PostConstruct
    void init() {
        if (phoneNumberId == null || phoneNumberId.isBlank()
            || accessToken == null || accessToken.isBlank()) {
            throw new IllegalStateException(
                "Meta Cloud WhatsApp provider selected but credentials are missing. "
                + "Set META_PHONE_NUMBER_ID and META_ACCESS_TOKEN.");
        }
        this.client = WebClient.builder()
            .baseUrl("https://graph.facebook.com/" + apiVersion)
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, "application/json")
            .build();
        log.info("[meta-cloud-whatsapp] initialised phoneNumberId={} apiVersion={} default={}/{} routes={} languages={}",
            phoneNumberId, apiVersion, defaultTemplateName, defaultTemplateLanguage,
            templateNames, languageCodes);
    }

    /** Visible for testing — replaces the WebClient with one pointed at a mock server. */
    void setClientForTest(WebClient client) {
        this.client = client;
    }

    @Override
    public SendResult send(WhatsAppPayload payload) {
        // Render the rich body for log traceability — Meta will deliver whatever
        // the resolved approved template contains, but logging the rendered text
        // makes failure modes (e.g. missing var, wrong locale) easy to diagnose.
        String renderedBody;
        try {
            renderedBody = renderForLogs(payload);
        } catch (RuntimeException ex) {
            renderedBody = "<render-failed: " + ex.getMessage() + ">";
        }

        String to = stripPlus(payload.toPhoneE164());
        String metaTemplateName = resolveTemplateName(payload.templateId());
        String metaLanguageCode = resolveLanguageCode(payload.locale());
        Map<String, Object> body = buildTemplateRequest(to, metaTemplateName, metaLanguageCode, payload);

        try {
            MetaResponse resp = client.post()
                .uri("/{phoneId}/messages", phoneNumberId)
                .bodyValue(body)
                .retrieve()
                .bodyToMono(MetaResponse.class)
                .block();

            String messageId = resp != null && resp.messages() != null && !resp.messages().isEmpty()
                ? resp.messages().get(0).id() : null;
            log.info("[meta-cloud-whatsapp] sent internalTemplate={} metaTemplate={}/{} to={} messageId={} body={}",
                payload.templateId(), metaTemplateName, metaLanguageCode,
                redactPhone(payload.toPhoneE164()), messageId, renderedBody);
            return new SendResult.Sent(messageId == null ? "unknown" : messageId);

        } catch (WebClientResponseException ex) {
            int status = ex.getStatusCode().value();
            String responseBody = safe(ex.getResponseBodyAsString());
            Integer code = parseMetaErrorCode(responseBody);
            String codeStr = code == null ? "http_" + status : String.valueOf(code);

            if (status >= 500) {
                log.warn("[meta-cloud-whatsapp] retryable 5xx status={} metaTemplate={}/{} to={} body={}",
                    status, metaTemplateName, metaLanguageCode,
                    redactPhone(payload.toPhoneE164()), responseBody);
                return new SendResult.Retryable("meta:" + codeStr + ":http_" + status);
            }
            if (code != null && TERMINAL_CODES.contains(code)) {
                log.warn("[meta-cloud-whatsapp] terminal failure code={} metaTemplate={}/{} to={} body={}",
                    code, metaTemplateName, metaLanguageCode,
                    redactPhone(payload.toPhoneE164()), responseBody);
                return new SendResult.Terminal(responseBody, codeStr);
            }
            log.warn("[meta-cloud-whatsapp] terminal 4xx status={} code={} metaTemplate={}/{} to={} body={}",
                status, codeStr, metaTemplateName, metaLanguageCode,
                redactPhone(payload.toPhoneE164()), responseBody);
            return new SendResult.Terminal(responseBody, codeStr);

        } catch (RuntimeException ex) {
            log.warn("[meta-cloud-whatsapp] transport error metaTemplate={}/{} to={}: {}",
                metaTemplateName, metaLanguageCode, redactPhone(payload.toPhoneE164()), ex.toString());
            return new SendResult.Retryable(
                "transport:" + ex.getClass().getSimpleName() + ":" + ex.getMessage());
        }
    }

    /** Maps internal templateId → Meta-approved template name. Falls back to default. */
    String resolveTemplateName(String internalTemplateId) {
        if (internalTemplateId == null) return defaultTemplateName;
        return templateNames.getOrDefault(internalTemplateId, defaultTemplateName);
    }

    /** Maps internal locale (en/ms/zh) → Meta language code (en_US/ms/zh_CN). */
    String resolveLanguageCode(String locale) {
        if (locale == null) return defaultTemplateLanguage;
        return languageCodes.getOrDefault(locale, defaultTemplateLanguage);
    }

    /**
     * Builds the Meta Cloud API template request. {@code hello_world} has no
     * variables so the {@code components} array is omitted; for any other
     * template the rendered variables are passed as positional body parameters.
     */
    private Map<String, Object> buildTemplateRequest(String to, String metaTemplateName,
                                                     String metaLanguageCode, WhatsAppPayload payload) {
        Map<String, Object> language = new LinkedHashMap<>();
        language.put("code", metaLanguageCode);

        Map<String, Object> template = new LinkedHashMap<>();
        template.put("name", metaTemplateName);
        template.put("language", language);

        if (!"hello_world".equals(metaTemplateName)) {
            try {
                List<Map<String, String>> params = orderedVars(payload.templateId(), payload.vars()).stream()
                    .map(v -> Map.of("type", "text", "text", v))
                    .toList();
                if (!params.isEmpty()) {
                    template.put("components", List.of(Map.of(
                        "type", "body",
                        "parameters", params
                    )));
                }
            } catch (IllegalArgumentException ex) {
                // Unknown templateId — send template with no body parameters and let
                // Meta reject if the template requires them. Should not happen for
                // any in-tree templateId.
                log.warn("[meta-cloud-whatsapp] no var ordering for template {} — sending without parameters",
                    payload.templateId());
            }
        }

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("messaging_product", "whatsapp");
        root.put("to", to);
        root.put("type", "template");
        root.put("template", template);
        return root;
    }

    private String renderForLogs(WhatsAppPayload payload) {
        List<String> ordered = orderedVars(payload.templateId(), payload.vars());
        return templates.render(payload.templateId(), payload.locale(), ordered);
    }

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

    private static Integer parseMetaErrorCode(String body) {
        if (body == null) return null;
        int idx = body.indexOf("\"code\"");
        if (idx < 0) return null;
        int colon = body.indexOf(':', idx);
        if (colon < 0) return null;
        int start = colon + 1;
        while (start < body.length() && !Character.isDigit(body.charAt(start))) start++;
        int end = start;
        while (end < body.length() && Character.isDigit(body.charAt(end))) end++;
        if (end == start) return null;
        try {
            return Integer.parseInt(body.substring(start, end));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String stripPlus(String e164) {
        return e164 != null && e164.startsWith("+") ? e164.substring(1) : e164;
    }

    private static String redactPhone(String e164) {
        if (e164 == null || e164.length() < 4) return "****";
        return "****" + e164.substring(e164.length() - 4);
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    public record MetaResponse(String messaging_product, List<MessageId> messages) {}
    public record MessageId(String id) {}
}
