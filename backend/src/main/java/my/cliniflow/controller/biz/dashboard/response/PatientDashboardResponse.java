package my.cliniflow.controller.biz.dashboard.response;

import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;

import java.time.LocalDate;
import java.util.List;

public record PatientDashboardResponse(
    AppointmentDTO nextAppointment,
    Stats stats,
    List<TimelinePoint> timeline
) {
    public record Stats(
        long pastConsultations,
        long activeMedications,
        long allergies,
        LocalDate lastVisitDate
    ) {}
    public record TimelinePoint(LocalDate date, String kind, String summary) {}
}
