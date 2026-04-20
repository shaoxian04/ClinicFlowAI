package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.VisitModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface VisitRepository extends JpaRepository<VisitModel, UUID> {
}
