package my.cliniflow.application.biz.visit;

import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;

import java.util.UUID;

/**
 * Assembles the combined identification block — clinic, patient, doctor, visit —
 * used by the Doctor Report Preview and the patient e-prescription modal.
 */
public interface VisitIdentificationReadAppService {

    VisitIdentificationInfo assemble(UUID visitId);
}
