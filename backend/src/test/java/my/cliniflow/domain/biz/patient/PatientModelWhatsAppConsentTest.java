package my.cliniflow.domain.biz.patient;

import my.cliniflow.domain.biz.patient.model.PatientModel;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.*;

class PatientModelWhatsAppConsentTest {

    private static final OffsetDateTime NOW = OffsetDateTime.parse("2026-04-30T10:00:00+08:00");

    private PatientModel newPatient() {
        PatientModel p = new PatientModel();
        p.setFullName("Test Patient");
        p.setPhone("+60-12-000-0000");
        return p;
    }

    @Test
    void grant_sets_at_and_version() {
        PatientModel p = newPatient();
        p.grantWhatsAppConsent(NOW, "wa-v1");
        assertThat(p.getWhatsappConsentAt()).isEqualTo(NOW);
        assertThat(p.getWhatsappConsentVersion()).isEqualTo("wa-v1");
    }

    @Test
    void grant_without_phone_throws() {
        PatientModel p = newPatient();
        p.setPhone(null);
        assertThatThrownBy(() -> p.grantWhatsAppConsent(NOW, "wa-v1"))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("phone required");
    }

    @Test
    void grant_with_blank_phone_throws() {
        PatientModel p = newPatient();
        p.setPhone("   ");
        assertThatThrownBy(() -> p.grantWhatsAppConsent(NOW, "wa-v1"))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void withdraw_clears_at_keeps_version_for_history() {
        PatientModel p = newPatient();
        p.grantWhatsAppConsent(NOW, "wa-v1");
        p.withdrawWhatsAppConsent();
        assertThat(p.getWhatsappConsentAt()).isNull();
        assertThat(p.getWhatsappConsentVersion()).isEqualTo("wa-v1");
    }

    @Test
    void withdraw_when_never_granted_is_idempotent() {
        PatientModel p = newPatient();
        p.withdrawWhatsAppConsent();
        assertThat(p.getWhatsappConsentAt()).isNull();
        assertThat(p.getWhatsappConsentVersion()).isNull();
    }

    @Test
    void update_phone_with_valid_value_replaces() {
        PatientModel p = newPatient();
        p.updatePhone("+60-12-999-9999");
        assertThat(p.getPhone()).isEqualTo("+60-12-999-9999");
    }

    @Test
    void clearing_phone_while_consent_on_throws() {
        PatientModel p = newPatient();
        p.grantWhatsAppConsent(NOW, "wa-v1");
        assertThatThrownBy(() -> p.updatePhone(null))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("withdraw consent before clearing phone");
        assertThatThrownBy(() -> p.updatePhone("   "))
            .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void clearing_phone_after_withdraw_is_allowed() {
        PatientModel p = newPatient();
        p.grantWhatsAppConsent(NOW, "wa-v1");
        p.withdrawWhatsAppConsent();
        p.updatePhone(null);
        assertThat(p.getPhone()).isNull();
    }
}
