package my.cliniflow.domain.biz.user.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "staff_profiles")
public class StaffProfileModel {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Column(name = "employee_id", unique = true, length = 32)
    private String employeeId;

    @Column(length = 255)
    private String notes;

    @Column(name = "gmt_create", nullable = false, updatable = false, insertable = false)
    private OffsetDateTime gmtCreate;

    @Column(name = "gmt_modified", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime gmtModified;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID v) { this.userId = v; }
    public String getEmployeeId() { return employeeId; }
    public void setEmployeeId(String v) { this.employeeId = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { this.notes = v; }
    public OffsetDateTime getGmtCreate() { return gmtCreate; }
    public OffsetDateTime getGmtModified() { return gmtModified; }
}
