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

## Visit-agent prompt composition (order matters)

1. System instructions (role, safety boundaries, SOAP schema, output contract)
2. Patient context from Neo4j multi-hop query
3. Active adaptive rules matching `(Doctor, Condition)` — labeled as "style guidance, optional"
4. Drug-interaction flags from the sub-query
5. Current transcript / text input

Do NOT import the Hermes codebase — adopt the feedback-loop pattern and skill-schema idea, but implement against our Neo4j `AdaptiveRule` nodes and our LangGraph flow.
