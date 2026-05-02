package my.cliniflow.application.biz.schedule;

import my.cliniflow.application.biz.patient.PatientReadAppService;
import my.cliniflow.application.biz.schedule.converter.AppointmentModel2DTOConverter;
import my.cliniflow.application.biz.schedule.converter.AppointmentSlotModel2DTOConverter;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.biz.schedule.response.AppointmentDTO;
import my.cliniflow.controller.biz.schedule.response.AvailabilityResponse;
import my.cliniflow.domain.biz.schedule.enums.AppointmentStatus;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class AppointmentReadAppServiceImpl implements AppointmentReadAppService {

    private static final ZoneId KL = ZoneId.of("Asia/Kuala_Lumpur");

    private final AppointmentRepository appts;
    private final AppointmentSlotRepository slots;
    private final PatientReadAppService patientReads;
    private final AppointmentModel2DTOConverter apptConverter;
    private final AppointmentSlotModel2DTOConverter slotConverter;
    private final AppointmentNameResolver nameResolver;
    private final UUID singleDoctorId;

    public AppointmentReadAppServiceImpl(
            AppointmentRepository appts,
            AppointmentSlotRepository slots,
            PatientReadAppService patientReads,
            AppointmentModel2DTOConverter apptConverter,
            AppointmentSlotModel2DTOConverter slotConverter,
            AppointmentNameResolver nameResolver,
            @Value("${cliniflow.dev.seeded-doctor-pk}") String singleDoctorId) {
        this.appts = appts;
        this.slots = slots;
        this.patientReads = patientReads;
        this.apptConverter = apptConverter;
        this.slotConverter = slotConverter;
        this.nameResolver = nameResolver;
        this.singleDoctorId = UUID.fromString(singleDoctorId);
    }

    @Override
    public AvailabilityResponse listAvailability(LocalDate from, LocalDate to) {
        var rows = slots.findByDoctorAndWindowAndStatus(
            singleDoctorId,
            ZonedDateTime.of(from, LocalTime.MIN, KL).toOffsetDateTime(),
            ZonedDateTime.of(to.plusDays(1), LocalTime.MIN, KL).toOffsetDateTime(),
            SlotStatus.AVAILABLE);
        return new AvailabilityResponse(rows.stream().map(slotConverter::convert).toList());
    }

    @Override
    public List<AppointmentDTO> listMine(UUID userId, AppointmentStatus filter) {
        UUID patientId = patientReads.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("patient profile not found: " + userId))
            .getId();
        return appts.findByPatient(patientId).stream()
            .filter(a -> filter == null || a.getStatus() == filter)
            .map(this::toDtoWithSlot)
            .toList();
    }

    @Override
    public AppointmentDTO findOne(UUID id, UUID userId) {
        UUID patientId = patientReads.findByUserId(userId)
            .orElseThrow(() -> new ResourceNotFoundException("patient profile not found: " + userId))
            .getId();
        AppointmentModel a = appts.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("appointment not found: " + id));
        if (!a.getPatientId().equals(patientId)) {
            throw new BusinessException(ResultCode.FORBIDDEN, "cross-patient appointment access");
        }
        return toDtoWithSlot(a);
    }

    @Override
    public AppointmentDTO findOneInternal(UUID id) {
        AppointmentModel a = appts.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("appointment not found: " + id));
        return toDtoWithSlot(a);
    }

    private AppointmentDTO toDtoWithSlot(AppointmentModel a) {
        AppointmentSlotModel slot = slots.findById(a.getSlotId()).orElse(null);
        AppointmentDTO base = slot != null ? apptConverter.convert(a, slot) : apptConverter.convert(a);
        String doctorName = slot != null ? nameResolver.doctorName(slot.getDoctorId()) : null;
        String patientName = nameResolver.patientName(a.getPatientId());
        return new AppointmentDTO(
            base.id(), base.slotId(), base.startAt(), base.endAt(),
            base.doctorId(), base.patientId(), base.visitId(), base.type(),
            base.parentVisitId(), base.status(), base.cancelledAt(),
            doctorName, patientName);
    }
}
