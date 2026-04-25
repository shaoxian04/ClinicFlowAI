package my.cliniflow.controller.biz.patient.response;

import java.util.List;

public record PatientContextResponse(
    List<Labeled> allergies,
    List<Labeled> chronicConditions,
    List<Medication> activeMedications,
    List<RecentVisit> recentVisits
) {
    public record Labeled(String id, String label) {}
    public record Medication(String id, String name, String dose) {}
    public record RecentVisit(String visitId, String date, String diagnosis) {}
}
