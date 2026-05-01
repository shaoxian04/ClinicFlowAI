package my.cliniflow.controller.biz.dashboard.response;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record DoctorQueueResponse(
    long total,
    List<DayGroup> groups
) {
    public record DayGroup(
        LocalDate date,
        long count,
        List<Item> items
    ) {}

    public record Item(
        UUID visitId,
        String patientName,
        String subjectivePreview,
        OffsetDateTime draftedAt,
        long minutesSinceDraft
    ) {}
}
