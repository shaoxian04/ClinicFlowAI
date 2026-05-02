package my.cliniflow.application.biz.user;

import java.util.UUID;

public interface UserWriteAppService {

    UUID createPatientUser(String email,
                           String rawPassword,
                           String fullName,
                           String phone,
                           String preferredLanguage);

    UUID createStaffUser(String email,
                         String tempPassword,
                         String fullName,
                         String phone,
                         String employeeId,
                         UUID actorUserId,
                         String actorRole);

    UUID createDoctorUser(String email,
                          String tempPassword,
                          String fullName,
                          String phone,
                          String mmcNumber,
                          String specialty,
                          String signatureImageUrl,
                          UUID actorUserId,
                          String actorRole);

    UUID createAdminUser(String email,
                         String tempPassword,
                         String fullName,
                         String phone,
                         UUID actorUserId,
                         String actorRole);

    void forcePasswordChange(UUID userId, String currentPassword, String newPassword);
}
