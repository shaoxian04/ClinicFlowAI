package my.cliniflow.application.biz.user;

import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ConflictException;
import my.cliniflow.controller.base.ResourceNotFoundException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.DoctorProfileModel;
import my.cliniflow.domain.biz.user.model.StaffProfileModel;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.DoctorProfileRepository;
import my.cliniflow.domain.biz.user.repository.StaffProfileRepository;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.audit.AuditWriter;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

@Service
public class UserWriteAppService {

    private final UserRepository users;
    private final DoctorProfileRepository doctors;
    private final StaffProfileRepository staffProfiles;
    private final PasswordEncoder passwordEncoder;
    private final AuditWriter audit;

    public UserWriteAppService(UserRepository users,
                                DoctorProfileRepository doctors,
                                StaffProfileRepository staffProfiles,
                                PasswordEncoder passwordEncoder,
                                AuditWriter audit) {
        this.users = users;
        this.doctors = doctors;
        this.staffProfiles = staffProfiles;
        this.passwordEncoder = passwordEncoder;
        this.audit = audit;
    }

    @Transactional
    public UUID createPatientUser(String email,
                                   String rawPassword,
                                   String fullName,
                                   String phone,
                                   String preferredLanguage) {
        guardEmailUnique(email);
        UserModel u = new UserModel();
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        u.setRole(Role.PATIENT);
        u.setFullName(fullName);
        u.setPhone(phone);
        u.setPreferredLanguage(preferredLanguage);
        u.setActive(true);
        u.setMustChangePassword(false);
        u.setConsentGivenAt(OffsetDateTime.now());
        users.saveAndFlush(u);
        audit.append("CREATE", "USER", u.getId().toString(), u.getId(), Role.PATIENT.name());
        return u.getId();
    }

    @Transactional
    public UUID createStaffUser(String email,
                                 String tempPassword,
                                 String fullName,
                                 String phone,
                                 String employeeId,
                                 UUID actorUserId,
                                 String actorRole) {
        guardEmailUnique(email);
        if (employeeId != null && staffProfiles.existsByEmployeeId(employeeId)) {
            throw new ConflictException("employee_id already in use");
        }
        UserModel u = new UserModel();
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(tempPassword));
        u.setRole(Role.STAFF);
        u.setFullName(fullName);
        u.setPhone(phone);
        u.setActive(true);
        u.setMustChangePassword(true);
        users.saveAndFlush(u);

        StaffProfileModel s = new StaffProfileModel();
        s.setUserId(u.getId());
        s.setEmployeeId(employeeId);
        staffProfiles.save(s);

        audit.append("CREATE", "USER", u.getId().toString(), actorUserId, actorRole);
        return u.getId();
    }

    @Transactional
    public UUID createDoctorUser(String email,
                                  String tempPassword,
                                  String fullName,
                                  String phone,
                                  String mmcNumber,
                                  String specialty,
                                  String signatureImageUrl,
                                  UUID actorUserId,
                                  String actorRole) {
        guardEmailUnique(email);
        if (mmcNumber == null || mmcNumber.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "MMC number is required");
        }
        if (doctors.existsByMmcNumber(mmcNumber)) {
            throw new ConflictException("MMC number already in use");
        }
        UserModel u = new UserModel();
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(tempPassword));
        u.setRole(Role.DOCTOR);
        u.setFullName(fullName);
        u.setPhone(phone);
        u.setActive(true);
        u.setMustChangePassword(true);
        users.saveAndFlush(u);

        DoctorProfileModel d = new DoctorProfileModel();
        d.setUserId(u.getId());
        d.setMmcNumber(mmcNumber);
        d.setSpecialty(specialty == null ? "General Practice" : specialty);
        d.setSignatureImageUrl(signatureImageUrl);
        d.setAcceptingPatients(true);
        doctors.save(d);

        audit.append("CREATE", "USER", u.getId().toString(), actorUserId, actorRole);
        return u.getId();
    }

    @Transactional
    public UUID createAdminUser(String email,
                                 String tempPassword,
                                 String fullName,
                                 String phone,
                                 UUID actorUserId,
                                 String actorRole) {
        guardEmailUnique(email);
        UserModel u = new UserModel();
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(tempPassword));
        u.setRole(Role.ADMIN);
        u.setFullName(fullName);
        u.setPhone(phone);
        u.setActive(true);
        u.setMustChangePassword(true);
        users.saveAndFlush(u);
        audit.append("CREATE", "USER", u.getId().toString(), actorUserId, actorRole);
        return u.getId();
    }

    @Transactional
    public void forcePasswordChange(UUID userId, String currentPassword, String newPassword) {
        UserModel u = users.findById(userId).orElseThrow(
            () -> new ResourceNotFoundException("USER", userId));
        if (!passwordEncoder.matches(currentPassword, u.getPasswordHash())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "current password incorrect");
        }
        if (newPassword == null || newPassword.length() < 12) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                "new password must be at least 12 characters");
        }
        u.setPasswordHash(passwordEncoder.encode(newPassword));
        u.setMustChangePassword(false);
        users.save(u);
        audit.append("UPDATE", "USER_PASSWORD", userId.toString(), userId, u.getRole().name());
    }

    private void guardEmailUnique(String email) {
        if (users.existsByEmail(email)) {
            throw new ConflictException("email already registered");
        }
    }
}
