package my.cliniflow.application.biz.patient;

import my.cliniflow.controller.biz.patient.response.PatientContextResponse;
import my.cliniflow.controller.biz.patient.response.PatientMeResponse;
import my.cliniflow.controller.biz.patient.response.PatientSummaryDTO;
import my.cliniflow.controller.biz.patient.response.PatientVisitDetailResponse;
import my.cliniflow.controller.biz.patient.response.PatientVisitSummaryResponse;
import my.cliniflow.domain.biz.patient.model.PatientClinicalProfileModel;
import my.cliniflow.domain.biz.patient.model.PatientModel;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PatientReadAppService {

    PatientMeResponse getMyProfile(UUID userId);

    PatientModel getById(UUID id);

    PatientSummaryDTO summary(UUID patientId);

    Optional<PatientModel> findByNationalId(String nationalIdRaw);

    Optional<PatientClinicalProfileModel> getClinicalProfile(UUID patientId);

    Optional<PatientModel> findByUserId(UUID userId);

    Optional<PatientModel> findById(UUID patientId);

    String decryptNationalId(PatientModel p);

    List<PatientModel> searchByName(String fragment);

    List<PatientVisitSummaryResponse> listForUser(UUID userId);

    PatientVisitDetailResponse detailForUser(UUID userId, UUID visitId);

    PatientContextResponse getContext(UUID patientId);
}
