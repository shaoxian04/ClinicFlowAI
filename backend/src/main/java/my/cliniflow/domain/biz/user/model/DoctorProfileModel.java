package my.cliniflow.domain.biz.user.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "doctors")
public class DoctorProfileModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(name = "mmc_number", nullable = false, unique = true, length = 32)
    private String mmcNumber;

    @Column(nullable = false, length = 64)
    private String specialty;

    @Column(name = "signature_image_url", length = 512)
    private String signatureImageUrl;

    @Column(name = "is_accepting_patients", nullable = false)
    private boolean acceptingPatients = true;

    @Column(name = "gmt_create", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID v) { this.userId = v; }
    public String getMmcNumber() { return mmcNumber; }
    public void setMmcNumber(String v) { this.mmcNumber = v; }
    public String getSpecialty() { return specialty; }
    public void setSpecialty(String v) { this.specialty = v; }
    public String getSignatureImageUrl() { return signatureImageUrl; }
    public void setSignatureImageUrl(String v) { this.signatureImageUrl = v; }
    public boolean isAcceptingPatients() { return acceptingPatients; }
    public void setAcceptingPatients(boolean v) { this.acceptingPatients = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
