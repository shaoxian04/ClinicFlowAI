package my.cliniflow.application.biz.visit;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class ConditionMixExtractorTest {

    private final ConditionMixExtractor extractor = new ConditionMixExtractor();

    @Test
    void recognises_urti_keywords() {
        assertThat(extractor.classify("Patient reports cough, sore throat for 2 days"))
            .isEqualTo("URTI");
        assertThat(extractor.classify("URTI symptoms; runny nose, fever"))
            .isEqualTo("URTI");
    }

    @Test
    void recognises_headache() {
        assertThat(extractor.classify("Throbbing headache since morning"))
            .isEqualTo("Headache");
    }

    @Test
    void recognises_diabetes_followup() {
        assertThat(extractor.classify("Diabetes follow-up. HbA1c 7.2."))
            .isEqualTo("Diabetes f/u");
        assertThat(extractor.classify("DM follow up, blood sugar stable"))
            .isEqualTo("Diabetes f/u");
    }

    @Test
    void recognises_hypertension() {
        assertThat(extractor.classify("Hypertension review. BP 138/86."))
            .isEqualTo("Hypertension f/u");
        assertThat(extractor.classify("HTN follow-up, on amlodipine"))
            .isEqualTo("Hypertension f/u");
    }

    @Test
    void recognises_fever() {
        assertThat(extractor.classify("Fever 38.5C since yesterday"))
            .isEqualTo("Fever");
    }

    @Test
    void unrecognised_text_is_other() {
        assertThat(extractor.classify("annual health check, asymptomatic"))
            .isEqualTo("Other");
        assertThat(extractor.classify(""))
            .isEqualTo("Other");
        assertThat(extractor.classify(null))
            .isEqualTo("Other");
    }
}
