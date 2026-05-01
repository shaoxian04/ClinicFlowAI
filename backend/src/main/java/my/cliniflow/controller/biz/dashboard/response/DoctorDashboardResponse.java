package my.cliniflow.controller.biz.dashboard.response;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record DoctorDashboardResponse(
    Kpis kpis,
    List<TrendPoint> visitsTrend,
    TrendDelta trendDelta,
    List<ConditionMixSlice> conditionMix,
    List<RecentlyFinalized> recentlyFinalized
) {
    public record Kpis(
        long awaitingReview,
        long bookedToday,
        long finalizedThisWeek,
        Long avgTimeToFinalizeMinutes
    ) {}
    public record TrendPoint(LocalDate date, long count) {}
    public record TrendDelta(long current, long prior, double deltaPct) {}
    public record ConditionMixSlice(String label, long count, double pct) {}
    public record RecentlyFinalized(UUID visitId, String patientName, String chiefComplaint, OffsetDateTime finalizedAt) {}
}
