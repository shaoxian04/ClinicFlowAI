package my.cliniflow.application.biz.dashboard;

import my.cliniflow.controller.biz.dashboard.response.DoctorQueueResponse;

/**
 * Lists draft SOAP notes (medical_reports.is_finalized = false) for the doctor's
 * review queue, grouped by the calendar day (Asia/Kuala_Lumpur) the draft was
 * created.
 */
public interface DoctorQueueReadAppService {

    DoctorQueueResponse build();
}
