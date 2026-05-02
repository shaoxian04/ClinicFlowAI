package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AppointmentNoShowDomainServiceImpl implements AppointmentNoShowDomainService {

    private final AppointmentRepository appts;

    public AppointmentNoShowDomainServiceImpl(AppointmentRepository appts) {
        this.appts = appts;
    }

    @Override
    @Transactional
    public AppointmentModel markNoShow(UUID appointmentId) {
        AppointmentModel appointment = appts.findById(appointmentId)
            .orElseThrow(() -> new IllegalStateException(
                "appointment not found: " + appointmentId));

        appointment.markNoShow();
        return appts.save(appointment);
    }
}
