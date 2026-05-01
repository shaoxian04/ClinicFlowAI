package my.cliniflow.infrastructure.notification.template;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * In-process registry of WhatsApp message templates in three locales (en, ms, zh).
 *
 * <p>Template IDs and their variable slots must match the approved templates
 * registered in the Twilio / Meta Business Manager account.
 *
 * <p>Variable substitution: templates use {@code {{1}}} ... {@code {{N}}} placeholders
 * (1-based), consistent with the WhatsApp Business API template format.
 */
@Component
public class MessageTemplateRegistry {

    /**
     * Outer key: templateId. Inner key: locale.
     * Populated once at construction time — the map is effectively immutable.
     */
    private final Map<String, Map<String, MessageTemplate>> registry;

    public MessageTemplateRegistry() {
        registry = Map.of(
            "appointment_confirmation_v1", Map.of(
                "en", new MessageTemplate(
                    "appointment_confirmation_v1", "en",
                    "Hi {{1}}, your appointment with Dr {{2}} is confirmed for {{3}} at {{4}}. "
                    + "Reply CANCEL to cancel.",
                    4),
                "ms", new MessageTemplate(
                    "appointment_confirmation_v1", "ms",
                    "Hai {{1}}, temujanji anda dengan Dr {{2}} telah disahkan pada {{3}} jam {{4}}. "
                    + "Balas BATAL untuk membatalkan.",
                    4),
                "zh", new MessageTemplate(
                    "appointment_confirmation_v1", "zh",
                    "您好 {{1}}，您与 {{2}} 医生的预约已确认，时间为 {{3}} {{4}}。"
                    + "回复「取消」可取消预约。",
                    4)
            ),
            "appointment_cancelled_v1", Map.of(
                "en", new MessageTemplate(
                    "appointment_cancelled_v1", "en",
                    "Hi {{1}}, your appointment with Dr {{2}} on {{3}} has been cancelled. "
                    + "Please contact the clinic to reschedule.",
                    3),
                "ms", new MessageTemplate(
                    "appointment_cancelled_v1", "ms",
                    "Hai {{1}}, temujanji anda dengan Dr {{2}} pada {{3}} telah dibatalkan. "
                    + "Sila hubungi klinik untuk membuat temujanji baharu.",
                    3),
                "zh", new MessageTemplate(
                    "appointment_cancelled_v1", "zh",
                    "您好 {{1}}，您与 {{2}} 医生在 {{3}} 的预约已取消。"
                    + "请联系诊所重新安排。",
                    3)
            ),
            "soap_meds_summary_v1", Map.of(
                "en", new MessageTemplate(
                    "soap_meds_summary_v1", "en",
                    "Hi {{1}}, here is your medication summary from your visit on {{2}}: {{3}}. "
                    + "Take as directed. Contact us if you have questions.",
                    3),
                "ms", new MessageTemplate(
                    "soap_meds_summary_v1", "ms",
                    "Hai {{1}}, berikut adalah ringkasan ubat anda dari lawatan pada {{2}}: {{3}}. "
                    + "Ambil seperti yang diarahkan. Hubungi kami jika ada soalan.",
                    3),
                "zh", new MessageTemplate(
                    "soap_meds_summary_v1", "zh",
                    "您好 {{1}}，以下是您 {{2}} 就诊时的用药摘要：{{3}}。"
                    + "请按医嘱服药。如有疑问请联系我们。",
                    3)
            ),
            "soap_followup_reminder_v1", Map.of(
                "en", new MessageTemplate(
                    "soap_followup_reminder_v1", "en",
                    "Hi {{1}}, this is a reminder that your follow-up with Dr {{2}} is scheduled "
                    + "for {{3}} at {{4}}. Please be on time.",
                    4),
                "ms", new MessageTemplate(
                    "soap_followup_reminder_v1", "ms",
                    "Hai {{1}}, ini adalah peringatan bahawa susulan anda dengan Dr {{2}} "
                    + "dijadualkan pada {{3}} jam {{4}}. Harap tepat masa.",
                    4),
                "zh", new MessageTemplate(
                    "soap_followup_reminder_v1", "zh",
                    "您好 {{1}}，提醒您与 {{2}} 医生的复诊时间为 {{3}} {{4}}，请准时出席。",
                    4)
            )
        );
    }

    /**
     * Returns the template for the given {@code templateId} and {@code locale},
     * falling back to {@code en} when the requested locale is not available.
     *
     * @throws IllegalArgumentException if {@code templateId} is not registered
     */
    public MessageTemplate resolve(String templateId, String locale) {
        Map<String, MessageTemplate> byLocale = registry.get(templateId);
        if (byLocale == null) {
            throw new IllegalArgumentException("Unknown template id: " + templateId);
        }
        return Optional.ofNullable(byLocale.get(locale))
                       .orElseGet(() -> byLocale.get("en"));
    }

    /**
     * Renders the template by substituting {@code {{1}}}...{@code {{N}}} with
     * the supplied variables (0-indexed list maps to 1-based placeholders).
     *
     * @param vars ordered variable values; size must equal {@link MessageTemplate#variableCount()}
     * @throws IllegalArgumentException if variable count does not match or templateId is unknown
     */
    public String render(String templateId, String locale, List<String> vars) {
        MessageTemplate template = resolve(templateId, locale);
        if (vars.size() != template.variableCount()) {
            throw new IllegalArgumentException(
                "Template '" + templateId + "' expects variable count " + template.variableCount()
                + " but received " + vars.size());
        }
        String rendered = template.body();
        for (int i = 0; i < vars.size(); i++) {
            rendered = rendered.replace("{{" + (i + 1) + "}}", vars.get(i));
        }
        return rendered;
    }
}
