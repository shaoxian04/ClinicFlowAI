package my.cliniflow.controller.biz.admin;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.admin.request.CreateUserRequest;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final UserWriteAppService userWrite;

    public AdminUserController(UserWriteAppService userWrite) { this.userWrite = userWrite; }

    @PostMapping
    public WebResult<Map<String, Object>> create(@Valid @RequestBody CreateUserRequest req,
                                                  Authentication auth) {
        if (!(auth.getPrincipal() instanceof JwtService.Claims claims)) {
            return WebResult.error(ResultCode.UNAUTHORIZED, "not authenticated");
        }
        UUID actor = claims.userId();
        UUID createdId = switch (req.role()) {
            case "STAFF" -> userWrite.createStaffUser(
                    req.email(), req.tempPassword(), req.fullName(),
                    req.phone(), req.employeeId(), actor, "ADMIN");
            case "DOCTOR" -> userWrite.createDoctorUser(
                    req.email(), req.tempPassword(), req.fullName(),
                    req.phone(), req.mmcNumber(), req.specialty(),
                    req.signatureImageUrl(), actor, "ADMIN");
            case "ADMIN" -> userWrite.createAdminUser(
                    req.email(), req.tempPassword(), req.fullName(),
                    req.phone(), actor, "ADMIN");
            default -> throw new IllegalArgumentException("invalid role: " + req.role());
        };
        return WebResult.ok(Map.of("userId", createdId.toString(), "role", req.role()));
    }
}
