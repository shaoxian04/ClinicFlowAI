# Open Questions

- **Secrets manager**: env files for MVP; migrate to AWS Secrets Manager or Vault post-pilot (SAD §4.5.4).
- **Neo4j schema tooling**: startup bootstrap script for MVP; revisit when production volume justifies a dedicated migration tool.
- **Self-hosted vs. SaaS telemetry**: pending PDPA-compliance review of Grafana Cloud / Sentry.
- **Assumptions to validate**: STT accuracy ≥ 90% for Malaysian-accented English; Z.AI GLM OpenAI-compatibility at the level LangGraph expects.

## Evaluator + drug validation (added 2026-05-01)

- **Override-reason retention**: per-finding `acknowledgement_reason` is stored verbatim (≤255 chars). PDPA review pending on whether free-text reasons may contain PHI that needs redaction before they can be aggregated for trend analysis.
- **Drug-knowledge graph governance**: `agent/app/graph/seed/drug_knowledge.json` ships 39 drugs / 9 DDIs / 6 dose rules curated for Malaysian primary care. Open question on update cadence and review process — a clinical pharmacist sign-off step is needed before each merge that touches the seed.
- **Severity mapping**: MAJOR→CRITICAL, MODERATE→HIGH, MINOR→LOW is hard-coded in the validator. Should this be configurable per clinic, or per drug class? Awaiting feedback from the pilot clinic.
- **Hermes-style learning of override patterns**: read side is built (per-finding ack reasons are queryable). Open question on whether overridden CRITICALs should ever auto-relax to HIGH after N similar overrides at one clinic — almost certainly **no** (clinical reasoning ≠ documentation style), but the question deserves an explicit decision before the Hermes write side is built.
- **SSE for live evaluator progress**: today the panel polls via synchronous re-evaluate on each draft mutation. SSE-streamed per-validator progress events would let the progress bar reflect real validator state instead of an indeterminate animation. Estimated effort: 2-3 days; deferred until a doctor reports it as a friction point.
