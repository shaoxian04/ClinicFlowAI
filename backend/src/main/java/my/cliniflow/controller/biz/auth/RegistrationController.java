package my.cliniflow.controller.biz.auth;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.patient.PatientWriteAppService;
import my.cliniflow.application.biz.patient.PatientWriteAppService.RegistrationInput;
import my.cliniflow.application.biz.patient.PatientWriteAppService.RegistrationResult;
import my.cliniflow.application.biz.user.UserReadAppService;
import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.auth.request.ForcedPasswordChangeRequest;
import my.cliniflow.controller.biz.auth.request.PatientSelfRegisterRequest;
import my.cliniflow.controller.biz.auth.response.PatientRegisteredResponse;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class RegistrationController {

    private final PatientWriteAppService patientWrite;
    private final UserWriteAppService userWrite;
    private final UserReadAppService userRead;
    private final JwtService jwt;

    public RegistrationController(PatientWriteAppService patientWrite,
                                   UserWriteAppService userWrite,
                                   UserReadAppService userRead,
                                   JwtService jwt) {
        this.patientWrite = patientWrite;
        this.userWrite = userWrite;
        this.userRead = userRead;
        this.jwt = jwt;
    }

    @PostMapping("/register/patient")
    public WebResult<PatientRegisteredResponse> register(
            @Valid @RequestBody PatientSelfRegisterRequest req) {
        RegistrationInput input = new RegistrationInput(
                req.fullName(),
                req.dateOfBirth(),
                req.gender(),
                req.phone(),
                req.email(),
                req.preferredLanguage() == null ? "en" : req.preferredLanguage(),
                req.nationalId(),
                "SELF_SERVICE",
                req.consentVersion(),
                true,
                req.password(),
                req.clinicalBaseline()
        );
        RegistrationResult result = patientWrite.register(input, null, "PATIENT");
        if (Boolean.TRUE.equals(req.whatsAppConsent())) {
            try {
                patientWrite.updateWhatsAppConsent(result.userId(), true);
            } catch (BusinessException ex) {
                throw ex;
            }
        }
        UserModel u = userRead.getById(result.userId());
        String token = jwt.issue(u.getId(), u.getEmail(), u.getRole());
        return WebResult.ok(new PatientRegisteredResponse(
                result.userId(), result.patientId(), u.getEmail(), u.getRole(), token));
    }

    @PostMapping("/forced-password-change")
    public WebResult<Void> forcedPasswordChange(
            @Valid @RequestBody ForcedPasswordChangeRequest req,
            Authentication auth) {
        if (auth == null || !(auth.getPrincipal() instanceof JwtService.Claims claims)) {
            return WebResult.error(ResultCode.UNAUTHORIZED, "not authenticated");
        }
        userWrite.forcePasswordChange(claims.userId(), req.currentPassword(), req.newPassword());
        return WebResult.ok(null);
    }
}
