package my.cliniflow.application.biz.visit;

import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Maps a SOAP {@code subjective} free-text blurb to one of a fixed set of
 * condition labels for the doctor dashboard's "Condition mix" donut.
 *
 * <p>MVP heuristic: case-insensitive keyword match in priority order. The
 * order matters — "URTI" must be checked before generic "fever" so that
 * a runny-nose-and-fever case lands in URTI not Fever.
 */
@Component
public class ConditionMixExtractor {

    private static final Map<String, List<String>> RULES = buildRules();

    private static Map<String, List<String>> buildRules() {
        Map<String, List<String>> m = new LinkedHashMap<>();
        m.put("URTI",            List.of("urti", "sore throat", "runny nose", "cough"));
        m.put("Diabetes f/u",    List.of("diabetes", " dm ", " dm,", " dm.", "hba1c", "blood sugar"));
        m.put("Hypertension f/u",List.of("hypertension", " htn ", " htn,", " htn."));
        m.put("Headache",        List.of("headache", "migraine"));
        m.put("Fever",           List.of("fever"));
        return m;
    }

    public String classify(String subjective) {
        if (subjective == null || subjective.isBlank()) return "Other";
        String s = " " + subjective.toLowerCase() + " ";
        for (var entry : RULES.entrySet()) {
            for (String kw : entry.getValue()) {
                if (s.contains(kw)) return entry.getKey();
            }
        }
        return "Other";
    }
}
