package my.cliniflow.domain.biz.visit.exception;

import java.util.List;
import java.util.UUID;

public class UnacknowledgedCriticalFindingsException extends RuntimeException {
    private final List<UUID> findingIds;

    public UnacknowledgedCriticalFindingsException(List<UUID> findingIds) {
        super("unacknowledged critical findings: " + findingIds);
        this.findingIds = List.copyOf(findingIds);
    }

    public List<UUID> getFindingIds() { return findingIds; }
}
