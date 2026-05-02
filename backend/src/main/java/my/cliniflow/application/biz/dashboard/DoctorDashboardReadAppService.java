package my.cliniflow.application.biz.dashboard;

import my.cliniflow.controller.biz.dashboard.response.DoctorDashboardResponse;

/**
 * Aggregates the doctor's dashboard data into one read.
 */
public interface DoctorDashboardReadAppService {

    DoctorDashboardResponse build();
}
