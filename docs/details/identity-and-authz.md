# Identity & Authorization

This file is the source of truth for how a Spring Boot controller knows **which patient (or doctor) it is acting on**. Every endpoint that touches per-patient data must follow these rules. Violating them was the root cause of the 2026-04-30 cross-patient PHI leak.

## Rule 1 — Identity comes from the JWT principal, not the request

For any endpoint that operates on per-user data, the entity ID **must** be resolved from the authenticated principal:

```java
JwtService.Claims claims = (JwtService.Claims) auth.getPrincipal();
PatientModel patient = patients.findByUserId(claims.userId())
    .orElseThrow(() -> new ResourceNotFoundException(...));
UUID patientId = patient.getId();
```

Never hardcode a UUID, never accept a `patientId` from the request body or path **without a subsequent ownership check** against the principal.

`PatientReadAppService.findByUserId()` is the canonical lookup. Add a sibling for `Doctor`/`Staff` if a future endpoint needs them.

## Rule 2 — Path-parameter IDs require an ownership check

When an endpoint takes `{visitId}` or `{patientId}` from the URL (necessary for resources that have to be addressable), the controller must verify the resource belongs to the caller before doing anything else:

```java
VisitModel visit = visits.findById(visitId)
    .orElseThrow(() -> new ResourceNotFoundException("VISIT", visitId));
if (!patient.getId().equals(visit.getPatientId())) {
    throw new BusinessException(ResultCode.FORBIDDEN,
        "visit does not belong to caller");
}
```

For non-`PATIENT` roles (`DOCTOR`, `STAFF`, `ADMIN`), the ownership check may be relaxed but the role gate must be explicit (`@PreAuthorize("hasAnyRole('DOCTOR','STAFF','ADMIN')")`). See `PatientsController.getClinicalProfile()` for the canonical mixed-role pattern.

## Rule 3 — `@PreAuthorize` is mandatory on every endpoint

`@EnableMethodSecurity` is on; `SecurityConfiguration` only enforces "authenticated" globally. Per-role gating is the controller's responsibility:

```java
@PreAuthorize("hasRole('PATIENT')")               // patient-only
@PreAuthorize("hasAnyRole('DOCTOR','STAFF')")     // staff-side
@PreAuthorize("hasRole('ADMIN')")                  // admin-only
```

If an endpoint genuinely should be open to all authenticated users, write a comment explaining why. Default-deny.

## Rule 4 — Every mutation writes an audit row

Any controller path that creates / updates / deletes per-patient data must call:

```java
audit.append(action, resourceType, resourceId.toString(),
             claims.userId(), claims.role().name());
```

Where `action ∈ {CREATE, UPDATE, DELETE, READ}` and `resourceType` is upper-snake-case (`PATIENT`, `VISIT`, `PRE_VISIT_REPORT`, `MEDICAL_REPORT`, `CONSENT`, etc.). The audit_log has DB triggers that reject UPDATE/DELETE — only INSERT goes through.

This is what makes incident triage possible. The 2026-04-30 incident left 65 contaminated visits unrecoverable specifically because `VISIT.CREATE` was never audited.

## Rule 5 — Evaluator finding endpoints reuse the visit ownership pattern

The evaluator routes added on `feat/evaluator-and-drug-validation` (`GET /api/visits/{visitId}/findings`, `POST /api/visits/{visitId}/findings/{findingId}/acknowledge`, `POST /api/visits/{visitId}/re-evaluate`) all take a path-parameter `visitId` and follow Rule 2 verbatim:

1. `@PreAuthorize("hasRole('DOCTOR')")` — staff and patients cannot read or acknowledge findings.
2. The handler resolves `VisitModel` by id and verifies `visit.getDoctorId().equals(claims.userId())` before any read or write. A foreign visit returns 403, not 404.
3. **Acknowledge writes** must include the doctor's free-text reason (≤255 chars, may be empty). The audit row is `UPDATE / evaluator_finding_ack`. **Do not auto-acknowledge** from a service-to-service path — every ack must trace to a real doctor. Hermes rule learning is read-only over this stream (CLAUDE.md invariants).
4. **Re-evaluate** is a `READ`-class audit (`READ / evaluator_reevaluate`) even though it triggers an agent computation, because no patient-data fields change in `audit_log`'s sense — only the findings projection is regenerated.

## Why this exists

See `docs/post-mortem/2026-04-30-cross-patient-phi-leak.md` (PM-08, PM-09, PM-10). The hardcoded UUID, the missed audit row, and the plausible-sounding "the LLM hallucinated" red herring all came from the same root: identity was assumed, not derived.
