# Post-Mortem: Cross-Patient PHI Leak in Pre-Visit — 2026-04-30

Severity: **CRITICAL** (PDPA — patient A saw patient B's clinical chart).
Detected by: end-user testing. A freshly-registered patient reported the agent claiming allergies they had never entered.

---

## PM-08 — Hardcoded `patientId` in `PreVisitController.start()`

**Mistake:** `PreVisitController.java:26` had a literal `UUID.fromString("00000000-0000-0000-0000-000000000010")` (the seeded `Pat Demo` patient row) as the `patient_id` for every `POST /api/previsit/sessions` request. A `// Day 1: hardcoded seeded patient. Day 3 replaces with a patients lookup by the authenticated user's user_id.` comment marked it as known temporary code that was then forgotten.

**Impact:** Every authenticated patient's pre-visit session was created against `Pat Demo`'s chart. The agent then **correctly** fetched Pat Demo's allergies (`Penicillin`, `Peanuts`) and presented them to whoever was logged in. 65 in-progress visits in production were misattributed to Pat Demo before the bug was caught. The `agent_turns` rows for those visits also contain other patients' chief-complaint statements stored under Pat Demo's chart.

**Solution:**
- `start()` now derives `patient_id` from the JWT principal: `patients.findByUserId(claims.userId())`.
- `turn()` verifies `visit.patient_id == caller's patient_id` and throws `BusinessException(FORBIDDEN)` otherwise (HTTP 403/40300).
- Both endpoints guarded by `@PreAuthorize("hasRole('PATIENT')")`.
- 65 contaminated in-progress visits marked `CANCELLED` in Postgres (data preserved for forensic review, never deleted).
- Added two regression tests in `PreVisitControllerIntegrationTest`:
  - `session_uses_authenticated_patient_id_not_seeded_demo` — asserts `visit.patient_id == authenticated patient.id` AND `!= 00000000-...0010`.
  - `turn_on_another_patients_visit_is_forbidden` — asserts cross-patient turn returns `40300`.

---

## PM-09 — LLM appearing to hallucinate when it was reading another patient's chart

**Mistake:** When the user reported the bug, the obvious read was "the LLM hallucinated penicillin and peanuts". Two prompt-engineering details made this seem plausible:
- The pre-visit prompt contained a literal example: `"Our records show you're allergic to penicillin. Is that still correct?"` — exactly the kind of anchoring that produces parroted output.
- The `seed_demo.py` Cypher unconditionally adds `Penicillin` and `Peanuts` allergies to every patient passed in.

**Impact:** Without checking the live Neo4j data and the `visits.patient_id` column, the conclusion would have been "harden the prompt" — which addresses a real but secondary concern and **leaves the actual PHI leak in place**.

**Solution:** Confirmed both: (a) the prompt has been hardened (placeholder template + explicit "ask an open question if tool returns nothing" rule + a hallucination guardrail forbidding facts not in tool output), AND (b) the actual root cause (hardcoded UUID) has been fixed. Don't stop at the first plausible-sounding cause — **always check what data the agent actually received** before blaming the LLM.

**Lesson, now in CLAUDE.md as an invariant:** server-side identity. Every patient/visit/report ID a controller acts on must come from the JWT principal, not from the request path/body without an ownership check. See `docs/details/identity-and-authz.md`.

---

## PM-10 — `audit_log` had no row for `VISIT.CREATE`

**Mistake:** When triaging the 65 contaminated visits, the obvious question was "which actual patient created this visit?" — to reattribute them to the correct chart. There was no answer. `audit_log` only had `CREATE PATIENT` and `CREATE CONSENT` rows; visit creation was never audited.

**Impact:** The 65 contaminated visits cannot be reattributed and were marked `CANCELLED` instead of being recovered. PDPA spec (`docs/details/non-functional.md`) implies every read and mutation of patient data writes an audit row; visit creation slipped the net.

**Solution:** (Not done in this incident's commit.) Add `audit.append("CREATE", "VISIT", visit.getId().toString(), ...)` in `PreVisitWriteAppService.startSession()` and any other code path that creates a `Visit`. Tracked as TODO; would have made cleanup possible here and remains a PDPA gap.

---

## What to take forward

1. **JWT-derived identity is non-negotiable** for any controller that acts on per-patient data. Codified in CLAUDE.md.
2. **Demo seeders must not run against real data.** `seed_demo.py` clobbers Penicillin+Peanuts onto every patient passed in — flagged in `docs/details/data-model.md` as destructive.
3. **Don't blame the LLM first.** When AI output looks wrong, check the inputs the agent received before assuming hallucination. The agent was honest — the data flow was wrong.
4. **Audit every mutation.** PDPA invariant only works if every CREATE/UPDATE/DELETE writes an audit row. `VISIT.CREATE` was missed.
