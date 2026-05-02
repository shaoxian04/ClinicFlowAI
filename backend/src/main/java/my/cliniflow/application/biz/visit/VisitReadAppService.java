package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.biz.visit.response.EvaluatorFindingDTO;
import my.cliniflow.controller.biz.visit.response.VisitDetailResponse;
import my.cliniflow.controller.biz.visit.response.VisitSummaryResponse;
import my.cliniflow.domain.biz.user.enums.Role;

import java.util.List;
import java.util.UUID;

public interface VisitReadAppService {

    record DoctorAndPatient(UUID doctorId, UUID patientId) {}

    List<VisitSummaryResponse> listForDoctor(UUID doctorId);

    DoctorAndPatient findDoctorAndPatient(UUID visitId);

    VisitDetailResponse detail(UUID visitId);

    List<EvaluatorFindingDTO> listFindings(UUID visitId, UUID requesterUserId, Role role);

    void assertOwnedBy(UUID visitId, UUID patientId);
}
