package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.model.MedicalReportModel;

import java.util.UUID;

public interface SoapWriteAppService {

    MedicalReportModel generateDraft(UUID visitId, String transcript);

    MedicalReportModel saveDraft(UUID visitId, String subjective, String objective, String assessment, String plan);

    MedicalReportModel finalize(UUID visitId, UUID doctorUserId, String subjective, String objective, String assessment, String plan);
}
