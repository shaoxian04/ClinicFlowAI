package my.cliniflow.infrastructure.outbox;

public enum Neo4jProjectionOperation {
    PATIENT_UPSERT,
    PATIENT_PROFILE_UPSERT,
    DOCTOR_UPSERT,
    ALLERGIES_REPLACE,
    CONDITIONS_REPLACE,
    MEDICATIONS_REPLACE
}
