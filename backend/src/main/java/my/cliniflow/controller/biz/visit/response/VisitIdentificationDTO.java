package my.cliniflow.controller.biz.visit.response;

import my.cliniflow.domain.biz.visit.info.VisitIdentificationInfo;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record VisitIdentificationDTO(Clinic clinic, Patient patient, Doctor doctor, Visit visit) {

    public record Clinic(String name, String addressLine1, String addressLine2,
                         String phone, String email, String registrationNumber) {}

    public record Patient(String fullName, String nationalId, LocalDate dateOfBirth,
                          int ageYears, String gender, String phone) {}

    public record Doctor(String fullName, String mmcNumber, String specialty) {}

    public record Visit(UUID visitId, UUID patientId, String referenceNumber, LocalDate visitDate,
                        OffsetDateTime finalizedAt) {}

    public static VisitIdentificationDTO from(VisitIdentificationInfo i) {
        return new VisitIdentificationDTO(
                new Clinic(
                        i.clinic().name(),
                        i.clinic().addressLine1(),
                        i.clinic().addressLine2(),
                        i.clinic().phone(),
                        i.clinic().email(),
                        i.clinic().registrationNumber()),
                new Patient(
                        i.patient().fullName(),
                        i.patient().nationalId(),
                        i.patient().dateOfBirth(),
                        i.patient().ageYears(),
                        i.patient().gender(),
                        i.patient().phone()),
                new Doctor(
                        i.doctor().fullName(),
                        i.doctor().mmcNumber(),
                        i.doctor().specialty()),
                new Visit(
                        i.visit().visitId(),
                        i.visit().patientId(),
                        i.visit().referenceNumber(),
                        i.visit().visitDate(),
                        i.visit().finalizedAt())
        );
    }
}
