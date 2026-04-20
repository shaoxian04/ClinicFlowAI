package my.cliniflow.domain.biz.visit.repository;

import my.cliniflow.domain.biz.visit.model.PostVisitSummaryModel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PostVisitSummaryRepository extends JpaRepository<PostVisitSummaryModel, UUID> {
    Optional<PostVisitSummaryModel> findByVisitId(UUID visitId);
}
