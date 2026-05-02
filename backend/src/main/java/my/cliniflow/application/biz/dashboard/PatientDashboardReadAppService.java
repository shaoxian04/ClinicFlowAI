package my.cliniflow.application.biz.dashboard;

import my.cliniflow.controller.biz.dashboard.response.PatientDashboardResponse;

import java.util.UUID;

public interface PatientDashboardReadAppService {

    PatientDashboardResponse build(UUID userId);
}
