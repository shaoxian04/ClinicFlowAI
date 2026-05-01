package my.cliniflow.infrastructure.notification.template;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MessageTemplateRegistryTest {

    private final MessageTemplateRegistry registry = new MessageTemplateRegistry();

    @Test
    void resolve_returns_locale_specific_template() {
        MessageTemplate en = registry.resolve("appointment_confirmation_v1", "en");
        assertThat(en.locale()).isEqualTo("en");
        assertThat(en.body()).contains("Hi {{1}}");

        MessageTemplate ms = registry.resolve("appointment_confirmation_v1", "ms");
        assertThat(ms.locale()).isEqualTo("ms");
        assertThat(ms.body()).contains("Hai {{1}}");
    }

    @Test
    void resolve_falls_back_to_en_for_unknown_locale() {
        MessageTemplate t = registry.resolve("appointment_confirmation_v1", "fr");
        assertThat(t.locale()).isEqualTo("en");
    }

    @Test
    void resolve_throws_for_unknown_template_id() {
        assertThatThrownBy(() -> registry.resolve("does_not_exist_v1", "en"))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void render_substitutes_variables_in_order() {
        String out = registry.render("appointment_confirmation_v1", "en",
            List.of("Alice", "Lim", "2026-05-04", "09:00"));
        assertThat(out).contains("Hi Alice");
        assertThat(out).contains("Dr Lim");
        assertThat(out).contains("2026-05-04");
        assertThat(out).contains("09:00");
        assertThat(out).doesNotContain("{{1}}");
    }

    @Test
    void render_throws_on_variable_count_mismatch() {
        assertThatThrownBy(() -> registry.render("appointment_confirmation_v1", "en",
            List.of("Alice", "Lim")))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("variable count");
    }
}
