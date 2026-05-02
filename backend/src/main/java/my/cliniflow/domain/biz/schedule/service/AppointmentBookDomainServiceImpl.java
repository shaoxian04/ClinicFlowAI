package my.cliniflow.domain.biz.schedule.service;

import my.cliniflow.domain.biz.schedule.enums.AppointmentType;
import my.cliniflow.domain.biz.schedule.enums.SlotStatus;
import my.cliniflow.domain.biz.schedule.model.AppointmentModel;
import my.cliniflow.domain.biz.schedule.model.AppointmentSlotModel;
import my.cliniflow.domain.biz.schedule.repository.AppointmentRepository;
import my.cliniflow.domain.biz.schedule.repository.AppointmentSlotRepository;
import my.cliniflow.domain.biz.schedule.service.exception.SlotTakenException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * <p>Concurrency strategy:
 * <ol>
 *   <li>{@code findByIdForUpdate} acquires a pessimistic write lock on the slot
 *       row, serialising bookings of the same slot.</li>
 *   <li>The partial unique index {@code uq_appointments_active_slot} is the
 *       second safety net — if a concurrent transaction beats this one to the
 *       insert despite the lock (e.g. read-committed surprise), the
 *       {@code DataIntegrityViolationException} is translated to
 *       {@link SlotTakenException}.</li>
 * </ol>
 */
@Service
public class AppointmentBookDomainServiceImpl implements AppointmentBookDomainService {

    private final AppointmentSlotRepository slots;
    private final AppointmentRepository appts;

    public AppointmentBookDomainServiceImpl(AppointmentSlotRepository slots,
                                            AppointmentRepository appts) {
        this.slots = slots;
        this.appts = appts;
    }

    @Override
    @Transactional
    public AppointmentModel book(UUID slotId,
                                 UUID patientId,
                                 UUID visitId,
                                 AppointmentType type,
                                 UUID parentVisitId) {
        AppointmentSlotModel slot = slots.findByIdForUpdate(slotId)
            .orElseThrow(() -> new SlotTakenException("slot not found: " + slotId));
        if (slot.getStatus() != SlotStatus.AVAILABLE) {
            throw new SlotTakenException("slot not available: " + slotId);
        }
        slot.book();
        slots.save(slot);
        try {
            return appts.save(AppointmentModel.book(slotId, patientId, visitId, type, parentVisitId));
        } catch (DataIntegrityViolationException ex) {
            throw new SlotTakenException("slot taken concurrently: " + slotId);
        }
    }
}
