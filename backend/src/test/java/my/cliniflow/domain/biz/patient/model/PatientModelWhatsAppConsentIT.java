package my.cliniflow.domain.biz.patient.model;

import my.cliniflow.domain.biz.patient.repository.PatientRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class PatientModelWhatsAppConsentIT {
    static final UUID SEEDED_PATIENT_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");

    @Autowired PatientRepository repo;

    @Test
    void persists_whatsapp_consent_columns() {
        PatientModel p = repo.findById(SEEDED_PATIENT_ID).orElseThrow();
        p.setWhatsappConsentAt(OffsetDateTime.parse("2026-04-30T10:00:00+08:00"));
        p.setWhatsappConsentVersion("wa-v1");
        repo.save(p);
        PatientModel reread = repo.findById(SEEDED_PATIENT_ID).orElseThrow();
        assertThat(reread.getWhatsappConsentAt()).isNotNull();
        assertThat(reread.getWhatsappConsentVersion()).isEqualTo("wa-v1");
    }
}
