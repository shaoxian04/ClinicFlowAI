package my.cliniflow.controller.biz.auth;

import jakarta.validation.Valid;
import my.cliniflow.application.biz.patient.PatientSeedDemoAppService;
import my.cliniflow.controller.base.ResultCode;
import my.cliniflow.controller.base.WebResult;
import my.cliniflow.controller.biz.auth.request.LoginRequest;
import my.cliniflow.controller.biz.auth.response.LoginResponse;
import my.cliniflow.domain.biz.user.model.UserModel;
import my.cliniflow.domain.biz.user.repository.UserRepository;
import my.cliniflow.infrastructure.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final JwtService jwt;
    private final PatientSeedDemoAppService seed;

    public AuthController(UserRepository users, PasswordEncoder encoder, JwtService jwt, PatientSeedDemoAppService seed) {
        this.users = users;
        this.encoder = encoder;
        this.jwt = jwt;
        this.seed = seed;
    }

    @PostMapping("/login")
    public WebResult<LoginResponse> login(@Valid @RequestBody LoginRequest req) {
        UserModel u = users.findByEmail(req.email())
            .filter(UserModel::isActive)
            .orElse(null);
        if (u == null || !encoder.matches(req.password(), u.getPasswordHash())) {
            return WebResult.error(ResultCode.UNAUTHORIZED, "invalid credentials");
        }
        String token = jwt.issue(u.getId(), u.getEmail(), u.getRole());
        return WebResult.ok(new LoginResponse(token, u.getId(), u.getEmail(), u.getRole(), u.getFullName(), seed.isEnabled()));
    }
}
