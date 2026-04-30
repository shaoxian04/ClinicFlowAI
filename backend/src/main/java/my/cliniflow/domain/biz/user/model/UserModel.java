package my.cliniflow.domain.biz.user.model;

import jakarta.persistence.*;
import my.cliniflow.domain.biz.user.enums.Role;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "users")
public class UserModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Role role;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Column(length = 32)
    private String phone;

    @Column(name = "preferred_language", length = 8)
    private String preferredLanguage;

    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword = false;

    @Column(name = "last_login_at")
    private OffsetDateTime lastLoginAt;

    @Column(name = "failed_login_attempts", nullable = false)
    private int failedLoginAttempts = 0;

    @Column(name = "locked_until")
    private OffsetDateTime lockedUntil;

    @Column(name = "consent_given_at")
    private OffsetDateTime consentGivenAt;

    @Column(name = "gmt_create", nullable = false, updatable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false)
    private OffsetDateTime gmtModified;

    @PrePersist
    void onInsert() {
        OffsetDateTime now = OffsetDateTime.now();
        gmtCreate = now;
        gmtModified = now;
    }

    @PreUpdate
    void onUpdate() { gmtModified = OffsetDateTime.now(); }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String preferredLanguage) { this.preferredLanguage = preferredLanguage; }
    public boolean isMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(boolean v) { this.mustChangePassword = v; }
    public OffsetDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(OffsetDateTime v) { this.lastLoginAt = v; }
    public int getFailedLoginAttempts() { return failedLoginAttempts; }
    public void setFailedLoginAttempts(int n) { this.failedLoginAttempts = n; }
    public OffsetDateTime getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(OffsetDateTime v) { this.lockedUntil = v; }
    public OffsetDateTime getConsentGivenAt() { return consentGivenAt; }
    public void setConsentGivenAt(OffsetDateTime v) { this.consentGivenAt = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public void setGmtCreate(OffsetDateTime v) { this.gmtCreate = v; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
    public void setGmtModified(OffsetDateTime v) { this.gmtModified = v; }
}
