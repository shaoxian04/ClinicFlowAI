package my.cliniflow.domain.biz.clinic.info;

public record ClinicInfo(
        String name,
        String addressLine1,
        String addressLine2,
        String phone,
        String email,
        String registrationNumber
) {}
