# Agent Design (SAD §2.4)

Three LangGraph agents inside the FastAPI service, one per phase. Shared components: prompt builder, token manager (truncate/summarize when over budget), response parser (JSON validator), graph-KB client, adaptive rule engine.

## Per-agent responsibilities

- **Pre-Visit Agent**: multi-turn symptom intake. GLM decides when intake is complete — no fixed script. Reads the Neo4j graph heavily for context (allergies, conditions, past visits) so follow-up questions are contextual. Writes `Symptom` nodes to Neo4j and structured report JSON to Postgres.
- **Visit Agent**: produces **SOAP** (Subjective / Objective / Assessment / Plan). Reads graph for patient context **and** runs the drug-interaction sub-flow. Contraindication flags surface in the doctor review UI. Adaptive rules are injected here (see Hermes pattern below).
- **Post-Visit Agent**: plain-language patient summary (layperson reading level): diagnosis, medication guide, red flags, follow-up. Reads little from the graph. Output cached; regenerated only when the medical report is amended.

## Graphify pattern → Neo4j knowledge graph

Neo4j is the literal implementation of the Graphify concept (https://github.com/safishamsi/graphify), adapted from code knowledge graphs to clinical concepts. **Every agent queries the graph before calling GLM** to pull multi-hop patient context into the prompt. Graph-RAG, not vector-RAG.

**Why a graph DB at all** — multi-hop reasoning that would be expensive JOINs in Postgres:
- **Hero query**: drug-interaction check. When the Visit agent extracts a new prescription, it runs a 2-hop Cypher query `Prescription → CONTRAINDICATED_BY → Allergy` (and `Prescription → INTERACTS_WITH → ActiveMedication`) and surfaces flags to the doctor before finalization.
- Pre-visit agent traverses `Patient → HAS_HISTORY_OF → Condition` + `Patient → PRESENTED_WITH → Symptom` across past visits.

**Techniques adapted from Graphify** (pattern, not library):
- **Two-pass extraction**: deterministic first (regex / clinical-dictionary entity extraction from transcripts) for `EXTRACTED` (confidence 1.0) edges, GLM second for `INFERRED` (confidence 0.0–1.0) edges. Tag every edge with relation type, confidence, and source location.
- **Confidence-scored edges** feed the doctor-review safety invariant: inferred edges are always surfaced as AI suggestions, not facts.
- **Hyperedges** for n-ary relations where useful (e.g., a prescription event that ties {Drug, Patient Allergy, Active Medication, Doctor override}).
- **Graph-tool interface**: expose Cypher queries as LangGraph tools (`get_patient_context`, `drug_interaction_check`, `get_applicable_rules`) rather than letting GLM write Cypher directly.

Do NOT import the Graphify codebase — it's code-oriented. Reimplement its techniques against Neo4j with the clinical node/edge schema in `data-model.md`.

## Hermes pattern → adaptive rule engine (documentation style only)

Implementation of the Hermes self-evolving agent concept (https://github.com/nousresearch/hermes-agent), **scoped deliberately to documentation style — never clinical reasoning**. This scoping is a hard safety boundary, not a phase-1 limitation: the engine must not self-modify any logic that could change diagnosis, treatment, medication dosing, or clinical red flags.

**What the engine may learn:** documentation conventions. E.g., "Dr. Lim consistently moves fatigue complaints from Subjective to Objective when paired with abnormal vitals", section-ordering preferences, abbreviation choices, phrasing style.

**What the engine must never learn:** diagnostic heuristics, drug choices, dosing, contraindication rules, red-flag thresholds, anything the GLM infers about the patient's condition.

**Feedback loop** (invoked via `POST /agents/rules/feedback`):
1. Doctor edits a generated medical report in the UI and finalizes it.
2. Spring Boot computes the edit diff (original AI output vs. final) and POSTs it to the agent service.
3. Rule engine proposes a style rule from the diff, scoped to the Doctor + Condition context.
4. Rule is written to Neo4j as an `AdaptiveRule` node: `(AdaptiveRule)-[:APPLIES_TO]->(Doctor)` and `(AdaptiveRule)-[:IN_CONTEXT_OF]->(Condition)`. Schema on the node: `trigger`, `transformation`, `proposed_at`, `acceptance_count`, `rejection_count`, `status` (`proposed | active | paused`).
5. On the next Visit agent call, applicable rules are retrieved by matching the current `Doctor` + `Condition` context and **injected into the Visit agent's prompt as optional style guidance**, never as binding instructions.

**Confidence gate:** a rule is only applied once its **doctor-acceptance rate ≥ 80%** (acceptance = doctor finalized the output unchanged in the regions the rule touched). Rules that fall below 50% acceptance over 24h are auto-paused and a P3 alert fires. Thresholds live in config, not code.

## Prompt-engineering invariants (apply to every agent)

These rules are universal — pre-visit, visit, post-visit, report-clarification, anything that puts patient data into a GLM prompt. A prior incident (2026-04-30 cross-patient PHI leak) involved an agent prompt with a literal `"penicillin"` example that looked like LLM hallucination but was actually correct retrieval against a wrong patient_id.

- **Never include real-sounding clinical values as example placeholders.** Use `<allergy_name>` / `<value>` style or drop the example. Concrete examples (penicillin, peanuts, metformin) act as hallucination anchors when tool calls fail or return empty.
- **No-data fallback is open-ended.** If `get_patient_context` returns `[]` for a slot, the agent must ask an open question (`"Do you have any allergies?"`) — never fall back to an example value.
- **Hallucination guardrail in every system prompt.** State explicitly: `NEVER mention any allergy / medication / condition / past visit unless that exact string appears in the tool output you received this turn.` Restate for each clinical data type the agent may surface.
- **Tool failures must not silently degrade.** If a tool errors or times out, the agent treats the slot as unknown and asks the patient — it does not invent a fallback value.

## Visit-agent prompt composition (order matters)

1. System instructions (role, safety boundaries, SOAP schema, output contract)
2. Patient context from Neo4j multi-hop query
3. Active adaptive rules matching `(Doctor, Condition)` — labeled as "style guidance, optional"
4. Drug-interaction flags from the sub-query
5. Current transcript / text input

Do NOT import the Hermes codebase — adopt the feedback-loop pattern and skill-schema idea, but implement against our Neo4j `AdaptiveRule` nodes and our LangGraph flow.

## Evaluator Agent (added 2026-05-01)

After the report drafter completes a SOAP draft, the **EvaluatorAgent** runs a parallel
suite of safety validators and persists findings against the visit. The doctor sees
findings in the AI Safety Review panel and must acknowledge any CRITICAL findings
before finalizing the report (soft-block).

**Five validators run in parallel (Phase 1 — fast Cypher / pure-Python):**

1. **DRUG_ALLERGY** — Cypher against patient's `:Allergy` nodes; existing `check_drug_interactions` reused. CRITICAL on hit.
2. **DDI** — Cypher across direct drug↔drug, drug↔class, class↔class `:INTERACTS_WITH` edges in the drug knowledge graph. Severity mapped from edge property: MAJOR→CRITICAL, MODERATE→HIGH, MINOR→LOW.
3. **PREGNANCY** — Cypher against `:PregnancyCategory` edge; orchestrator skips entirely when `patient.pregnancy_status` is NOT_PREGNANT/UNKNOWN/NULL. Privacy invariant: this Cypher never sees patient pregnancy state.
4. **DOSE** — Cypher against `:DoseRule` nodes filtered by patient age + weight + drug route. Orchestrator parses dose+frequency strings and emits over_max_dose / over_max_daily / under_min_dose / no_rule findings.
5. **COMPLETENESS** — pure-Python check on the draft for missing required fields.

**One validator runs sequentially (Phase 2 — LLM):**

6. **HALLUCINATION** — single LLM call asks "for every clinical claim in the draft, classify as SUPPORTED / CONTEXTUAL / INFERRED / UNSUPPORTED". Returns HIGH findings for UNSUPPORTED claims.

**Failure isolation:** every validator is wrapped in a per-validator try/except. A single validator failure marks that validator unavailable but does not tank the run.

**Persistence:** findings are written to `evaluator_findings` (Postgres) inside a single transaction with an advisory lock keyed on `visit_id`. Re-evaluation supersedes prior findings (sets `superseded_at`) and inserts new ones. The Java `acknowledge` flow updates `acknowledged_at/by/reason` directly via `EvaluatorFindingRepository`.

**SSE stream:** the `/agents/report/generate`, `/edit`, `/clarify` routes emit a single terminal event after the drafter completes:
- `evaluator.done { findings, validators_run, validators_unavailable }`
- `evaluator.error { reason }` (validator agent failed)

**Finalize gate:** `/agents/report/finalize` returns 409 with `{error: "unacknowledged_critical_findings", finding_ids: [...]}` if any CRITICAL is unacked at finalize time. Spring Boot `SoapWriteAppService.finalize` enforces the same guard before transitioning to FINALIZED.

**See:** `docs/superpowers/specs/2026-05-01-evaluator-and-drug-validation-design.md` for the full design.

## Patient-context routes (implemented)

- `GET /agents/patient-context/healthz` — Neo4j connectivity probe; returns 503 when Neo4j is down.
- `GET /agents/patient-context/{id}` — aggregated patient context (allergies, conditions, medications, recent visits); consumed by Spring Boot's `AgentServiceClient.getPatientContext()`.
- `POST /agents/patient-context/seed-demo-bulk` — dev-only idempotent bulk demo seeding; guarded in Spring Boot by `cliniflow.dev.seed-demo-enabled` flag.
