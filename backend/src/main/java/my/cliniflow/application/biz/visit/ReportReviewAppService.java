package my.cliniflow.application.biz.visit;

import my.cliniflow.controller.biz.visit.response.ApproveResponse;
import my.cliniflow.controller.biz.visit.response.ChatTurnsResponse;
import my.cliniflow.controller.biz.visit.response.FinalizeResponse;
import my.cliniflow.controller.biz.visit.response.ReportReviewResult;
import my.cliniflow.domain.biz.visit.dto.MedicalReportDto;

import java.util.UUID;

/**
 * Post-visit review orchestration. One class for the 7 review endpoints so
 * the transaction boundaries and state transitions are all visible in one
 * place. See spec §3 (data model) and §5 (flow sequences).
 */
public interface ReportReviewAppService {

    ReportReviewResult generate(UUID visitId, String transcript, String specialty);

    ReportReviewResult clarify(UUID visitId, String answer);

    ReportReviewResult edit(UUID visitId, String instruction);

    MedicalReportDto patchDraft(UUID visitId, String path, Object value);

    ChatTurnsResponse getChat(UUID visitId);

    ApproveResponse approve(UUID visitId);

    FinalizeResponse finalize(UUID visitId, UUID doctorId);
}
