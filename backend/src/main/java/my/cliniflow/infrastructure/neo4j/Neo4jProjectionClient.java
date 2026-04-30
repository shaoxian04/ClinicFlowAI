package my.cliniflow.infrastructure.neo4j;

import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.patient.repository.PatientClinicalProfileRepository;
import my.cliniflow.infrastructure.outbox.Neo4jProjectionOperation;
import jakarta.annotation.PostConstruct;
import org.neo4j.driver.Driver;
import org.neo4j.driver.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Projects Postgres aggregate state into Neo4j. Stateless; the worker calls
 * handle() once per outbox row inside its retry loop.
 *
 * Profile-related operations re-read the aggregate from Postgres rather than
 * relying on payload contents — keeps the projection eventually consistent
 * with the source of truth even if the row sat in the queue for a while.
 */
@Component
public class Neo4jProjectionClient {

    private static final Logger log = LoggerFactory.getLogger(Neo4jProjectionClient.class);

    private final Driver driver;
    private final PatientClinicalProfileRepository profiles;
    private final boolean probeEnabled;

    public Neo4jProjectionClient(Driver driver,
                                  PatientClinicalProfileRepository profiles,
                                  @Value("${cliniflow.neo4j.probe-on-startup:true}") boolean probeEnabled) {
        this.driver = driver;
        this.profiles = profiles;
        this.probeEnabled = probeEnabled;
    }

    /** Surface DNS / auth / routing problems at boot, not on the first outbox row. */
    @PostConstruct
    void probe() {
        if (!probeEnabled) return;
        try (Session s = driver.session()) {
            s.run("RETURN 1").consume();
            log.info("neo4j.probe ok — projection client connected");
        } catch (RuntimeException ex) {
            log.error("neo4j.probe failed — registration outbox will accumulate FAILED rows until fixed: {}",
                    ex.toString(), ex);
        }
    }

    public void handle(Neo4jProjectionOperation op,
                       UUID aggregateId,
                       Map<String, Object> payload) {
        switch (op) {
            case PATIENT_UPSERT -> upsertPatient(aggregateId, payload);
            case PATIENT_PROFILE_UPSERT,
                 ALLERGIES_REPLACE,
                 CONDITIONS_REPLACE,
                 MEDICATIONS_REPLACE -> projectClinicalProfile(aggregateId);
            case DOCTOR_UPSERT -> upsertDoctor(aggregateId, payload);
        }
    }

    private void upsertPatient(UUID patientId, Map<String, Object> payload) {
        String cypher = """
                MERGE (p:Patient {id: $id})
                  SET p.full_name          = $fullName,
                      p.dob                = $dob,
                      p.gender             = $gender,
                      p.preferred_language = $preferredLanguage,
                      p.updated_at         = datetime()
                """;
        Map<String, Object> params = new HashMap<>();
        params.put("id", patientId.toString());
        params.put("fullName", payload.get("fullName"));
        params.put("dob", payload.get("dateOfBirth"));
        params.put("gender", payload.get("gender"));
        params.put("preferredLanguage", payload.get("preferredLanguage"));
        long t0 = System.currentTimeMillis();
        try (Session s = driver.session()) {
            var summary = s.executeWrite(tx -> tx.run(cypher, params).consume());
            log.debug("neo4j.cypher op=PATIENT_UPSERT id={} nodesCreated={} propsSet={} cypherMs={}",
                    patientId, summary.counters().nodesCreated(),
                    summary.counters().propertiesSet(),
                    System.currentTimeMillis() - t0);
        }
    }

    private void upsertDoctor(UUID doctorId, Map<String, Object> payload) {
        String cypher = """
                MERGE (d:Doctor {id: $id})
                  SET d.full_name  = $fullName,
                      d.specialty  = $specialty,
                      d.mmc_number = $mmcNumber,
                      d.updated_at = datetime()
                """;
        Map<String, Object> params = new HashMap<>();
        params.put("id", doctorId.toString());
        params.put("fullName", payload.get("fullName"));
        params.put("specialty", payload.get("specialty"));
        params.put("mmcNumber", payload.get("mmcNumber"));
        long t0 = System.currentTimeMillis();
        try (Session s = driver.session()) {
            var summary = s.executeWrite(tx -> tx.run(cypher, params).consume());
            log.debug("neo4j.cypher op=DOCTOR_UPSERT id={} nodesCreated={} propsSet={} cypherMs={}",
                    doctorId, summary.counters().nodesCreated(),
                    summary.counters().propertiesSet(),
                    System.currentTimeMillis() - t0);
        }
    }

    /**
     * Replace the patient's allergy/condition/medication subgraph from the
     * current Postgres clinical profile. Re-reading on each apply means a
     * delayed projection still ends with the latest state.
     */
    private void projectClinicalProfile(UUID patientId) {
        PatientClinicalProfileModel prof = profiles.findByPatientId(patientId).orElse(null);
        if (prof == null) {
            log.info("neo4j.projection.profile_missing patientId={} (skipping projection)", patientId);
            return;
        }
        List<String> allergies = extractNames(prof.getDrugAllergies());
        List<String> conditions = extractNames(prof.getChronicConditions());
        List<Map<String, Object>> medications = extractMedications(prof.getRegularMedications());
        log.debug("neo4j.projection.profile patientId={} allergies={} conditions={} medications={}",
                patientId, allergies.size(), conditions.size(), medications.size());

        String cypher = """
                MERGE (p:Patient {id: $id})
                WITH p
                OPTIONAL MATCH (p)-[r:ALLERGIC_TO|HAS_CONDITION|TAKES]->()
                DELETE r
                WITH p
                FOREACH (name IN $allergies |
                  MERGE (a:Allergy {name: name})
                  MERGE (p)-[:ALLERGIC_TO {confidence: 1.0, source: 'REGISTRATION'}]->(a)
                )
                FOREACH (name IN $conditions |
                  MERGE (c:Condition {name: name})
                  MERGE (p)-[:HAS_CONDITION {confidence: 1.0, source: 'REGISTRATION'}]->(c)
                )
                FOREACH (med IN $medications |
                  MERGE (m:Medication {name: med.name})
                  MERGE (p)-[t:TAKES {confidence: 1.0, source: 'REGISTRATION'}]->(m)
                  SET t.dose = med.dose, t.frequency = med.frequency
                )
                """;
        Map<String, Object> params = new HashMap<>();
        params.put("id", patientId.toString());
        params.put("allergies", allergies);
        params.put("conditions", conditions);
        params.put("medications", medications);
        long t0 = System.currentTimeMillis();
        try (Session s = driver.session()) {
            var summary = s.executeWrite(tx -> tx.run(cypher, params).consume());
            log.debug("neo4j.cypher op=PROFILE_PROJECT id={} nodesCreated={} relsCreated={} relsDeleted={} propsSet={} cypherMs={}",
                    patientId, summary.counters().nodesCreated(),
                    summary.counters().relationshipsCreated(),
                    summary.counters().relationshipsDeleted(),
                    summary.counters().propertiesSet(),
                    System.currentTimeMillis() - t0);
        }
    }

    private static List<String> extractNames(List<Map<String, Object>> items) {
        List<String> out = new ArrayList<>();
        if (items == null) return out;
        for (Map<String, Object> item : items) {
            Object name = item.get("name");
            if (name != null && !name.toString().isBlank()) out.add(name.toString());
        }
        return out;
    }

    private static List<Map<String, Object>> extractMedications(List<Map<String, Object>> items) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (items == null) return out;
        for (Map<String, Object> item : items) {
            Object name = item.get("name");
            if (name == null || name.toString().isBlank()) continue;
            Map<String, Object> m = new HashMap<>();
            m.put("name", name.toString());
            m.put("dose", item.get("dose"));
            m.put("frequency", item.get("frequency"));
            out.add(m);
        }
        return out;
    }
}
