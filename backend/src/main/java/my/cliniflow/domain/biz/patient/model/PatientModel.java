package my.cliniflow.domain.biz.patient.model;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "patients")
public class PatientModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "national_id_ciphertext")
    private byte[] nationalIdCiphertext;

    @Column(name = "national_id_fingerprint", length = 64, unique = true)
    private String nationalIdFingerprint;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(length = 16)
    private String gender;

    @Column(length = 32)
    private String phone;

    @Column
    private String email;

    @Column(name = "preferred_language", length = 8)
    private String preferredLanguage;

    @Column(name = "registration_source", nullable = false, length = 16)
    private String registrationSource = "STAFF_LED";

    @Column(name = "consent_given_at")
    private OffsetDateTime consentGivenAt;

    @Column(name = "consent_version", length = 16)
    private String consentVersion;

    @Column(name = "whatsapp_consent_at")
    private OffsetDateTime whatsappConsentAt;

    @Column(name = "whatsapp_consent_version", length = 16)
    private String whatsappConsentVersion;

    @Column(name = "gmt_create", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public byte[] getNationalIdCiphertext() { return nationalIdCiphertext; }
    public void setNationalIdCiphertext(byte[] v) { this.nationalIdCiphertext = v; }
    public String getNationalIdFingerprint() { return nationalIdFingerprint; }
    public void setNationalIdFingerprint(String v) { this.nationalIdFingerprint = v; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate dateOfBirth) { this.dateOfBirth = dateOfBirth; }
    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPreferredLanguage() { return preferredLanguage; }
    public void setPreferredLanguage(String v) { this.preferredLanguage = v; }
    public String getRegistrationSource() { return registrationSource; }
    public void setRegistrationSource(String v) { this.registrationSource = v; }
    public OffsetDateTime getConsentGivenAt() { return consentGivenAt; }
    public void setConsentGivenAt(OffsetDateTime v) { this.consentGivenAt = v; }
    public String getConsentVersion() { return consentVersion; }
    public void setConsentVersion(String v) { this.consentVersion = v; }
    public OffsetDateTime getWhatsappConsentAt() { return whatsappConsentAt; }
    public void setWhatsappConsentAt(OffsetDateTime v) { this.whatsappConsentAt = v; }
    public String getWhatsappConsentVersion() { return whatsappConsentVersion; }
    public void setWhatsappConsentVersion(String v) { this.whatsappConsentVersion = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }

    /**
     * Grant WhatsApp consent. Requires a non-blank phone number.
     *
     * @throws IllegalStateException if phone is null or blank
     */
    public void grantWhatsAppConsent(OffsetDateTime at, String version) {
        if (this.phone == null || this.phone.isBlank()) {
            throw new IllegalStateException("phone required before granting whatsapp consent");
        }
        this.whatsappConsentAt = at;
        this.whatsappConsentVersion = version;
    }

    /**
     * Withdraw WhatsApp consent. Idempotent — keeps version for audit history.
     */
    public void withdrawWhatsAppConsent() {
        this.whatsappConsentAt = null;
        // keep whatsappConsentVersion for history
    }

    /**
     * Update phone. Rejects null/blank if consent is currently active —
     * withdraw consent before clearing the phone.
     */
    public void updatePhone(String newPhone) {
        if (whatsappConsentAt != null && (newPhone == null || newPhone.isBlank())) {
            throw new IllegalStateException("withdraw consent before clearing phone");
        }
        this.phone = newPhone;
    }
}
