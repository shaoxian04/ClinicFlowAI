package my.cliniflow.controller.biz.admin;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.user.UserAdminAppService;
import my.cliniflow.application.biz.user.UserWriteAppService;
import my.cliniflow.controller.base.BusinessException;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.admin.request.ActiveRequest;
import my.cliniflow.controller.biz.admin.request.CreateUserRequest;
import my.cliniflow.controller.biz.admin.request.RoleChangeRequest;
import my.cliniflow.domain.biz.user.enums.Role;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final UserWriteAppService userWrite;
    private final UserAdminAppService adminSvc;
    private final UserRepository users;

    public AdminUserController(UserWriteAppService userWrite,
                                UserAdminAppService adminSvc,
                                UserRepository users) {
        this.userWrite = userWrite;
        this.adminSvc = adminSvc;
        this.users = users;
    }

    @GetMapping
    public WebResult<Map<String, Object>> list() {
        List<Map<String, Object>> rows = users.findAll().stream()
                .map(u -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("id", u.getId().toString());
                    m.put("email", u.getEmail());
                    m.put("name", u.getFullName());
                    m.put("role", u.getRole().name());
                    m.put("active", u.isActive());
                    return m;
                })
                .toList();
        return WebResult.ok(Map.of("users", rows));
    }

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

    @PatchMapping("/{id}/role")
    public WebResult<Void> changeRole(@PathVariable("id") UUID targetId,
                                       @Valid @RequestBody RoleChangeRequest req,
                                       Authentication auth) {
        UUID actor = ((JwtService.Claims) auth.getPrincipal()).userId();
        Role role;
        try {
            role = Role.valueOf(req.role());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "invalid role: " + req.role());
        }
        adminSvc.changeRole(actor, targetId, role);
        return WebResult.ok(null);
    }

    @PatchMapping("/{id}/active")
    public WebResult<Void> setActive(@PathVariable("id") UUID targetId,
                                      @Valid @RequestBody ActiveRequest req,
                                      Authentication auth) {
        UUID actor = ((JwtService.Claims) auth.getPrincipal()).userId();
        adminSvc.setActive(actor, targetId, req.active());
        return WebResult.ok(null);
    }

    @PostMapping("/{id}/force-password-reset")
    public WebResult<Void> forcePasswordReset(@PathVariable("id") UUID targetId,
                                               Authentication auth) {
        UUID actor = ((JwtService.Claims) auth.getPrincipal()).userId();
        adminSvc.forcePasswordReset(actor, targetId);
        return WebResult.ok(null);
    }
}
