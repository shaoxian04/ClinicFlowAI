package my.cliniflow.infrastructure.security;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import my.cliniflow.domain.biz.user.enums.Role;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.UUID;

@Service
public class JwtService {

    private final SecretKey key;
    private final long expiryMinutes;

    public JwtService(
        @Value("${cliniflow.jwt.secret}") String secret,
        @Value("${cliniflow.jwt.expiry-minutes}") long expiryMinutes
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiryMinutes = expiryMinutes;
    }

    public String issue(UUID userId, String email, Role role) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .claim("email", email)
            .claim("role", role.name())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plus(expiryMinutes, ChronoUnit.MINUTES)))
            .signWith(key)
            .compact();
    }

    public Claims parse(String token) {
        io.jsonwebtoken.Claims c = Jwts.parser()
            .verifyWith(key).build()
            .parseSignedClaims(token).getPayload();
        return new Claims(
            UUID.fromString(c.getSubject()),
            c.get("email", String.class),
            Role.valueOf(c.get("role", String.class))
        );
    }

    public record Claims(UUID userId, String email, Role role) {}
}
