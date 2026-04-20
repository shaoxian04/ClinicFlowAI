# Non-Functional Requirements (SAD §3.2)

- **PDPA compliance (Malaysia PDPA 2010)**: encryption at rest + in transit, RBAC, consent, append-only audit log.
- **Performance targets**: GLM p95 ≤ 5s; pre-visit conversational turn < 3s; GLM call timeout 8s; STT timeout 15s. P2 incident if GLM p95 > 10s.
- **Resilience4j** circuit breaker: opens at > 50% error rate, half-open after 30s. Per-doctor rate limiter.
- **Rollout strategy**: Canary 5% → Beta 25% → Majority 50% → General 100% with quantitative gates. A/B test adaptive-rules-on vs. baseline, target ≥ 20% doctor-edit-rate reduction.
- **Priority matrix**: P0 (data leak) → full freeze; P1 (>5% GLM error / dangerous content) → auto-rollback to Golden image < 15min; P2 ≤ 1h; P3 ≤ 24h; P4 next sprint.
- **Four Golden Signals** (latency, traffic, errors, saturation) per service. Instrument with Micrometer + Actuator (Java) and `prometheus_client` (Python).
- **Correlation IDs** (`X-Correlation-ID`) generated at Spring Boot ingress, propagated to the agent service, used in every log line. End-to-end trace via Loki query `{correlation_id="..."}`.
