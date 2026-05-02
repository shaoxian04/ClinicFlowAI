package my.cliniflow.domain.biz.visit.info;

import my.cliniflow.domain.biz.clinic.info.ClinicInfo;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record VisitIdentificationInfo(
        ClinicInfo clinic,
        Patient patient,
        Doctor doctor,
        Visit visit
) {
    public record Patient(String fullName, String nationalId, LocalDate dateOfBirth,
                          int ageYears, String gender, String phone) {}

    public record Doctor(String fullName, String mmcNumber, String specialty) {}

    public record Visit(
            UUID visitId,
            UUID patientId,    // internal only — used for ownership checks, never expose in response DTOs
            String referenceNumber,
            LocalDate visitDate,
            OffsetDateTime finalizedAt
    ) {}
}
