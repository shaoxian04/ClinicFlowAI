package my.cliniflow.domain.biz.visit.model;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "pre_visit_reports")
public class PreVisitReportModel {

    @Id
    @GeneratedValue
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "visit_id", nullable = false, unique = true)
    private VisitModel visit;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> structured = new HashMap<>();

    @Column(nullable = false, length = 32)
    private String source = "AI";

    public UUID getId() { return id; }
    public VisitModel getVisit() { return visit; }
    public void setVisit(VisitModel v) { this.visit = v; }
    public Map<String, Object> getStructured() { return structured; }
    public void setStructured(Map<String, Object> v) { this.structured = v; }
    public String getSource() { return source; }
    public void setSource(String v) { this.source = v; }
}
