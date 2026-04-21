# Frontend Enhancement Plan — PRD + SAD alignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the CliniFlow frontend into explicit alignment with the Product Requirement Document and System Analysis Documentation — close the gaps between *what the spec promises* and *what the UI currently exposes* — while also lifting the overall visual/interaction quality from functional to unforgettable.

**Architecture:** Stay on Next.js 14 App Router + TypeScript strict + the warm-paper / forest-teal / terracotta token system already in `globals.css`. Frontend talks to Spring Boot only (no direct agent or Neo4j calls — PRD §8.2 + SAD §2.1). Where this plan calls for a new frontend feature, it assumes the backend endpoint exists or is stubbed in a mock API route; backend work is called out explicitly and left as a precondition.

**Tech Stack:** Next.js 14, React 18, TypeScript, Fraunces/Outfit, CSS variables. Add **Motion** (Framer) only in Phase 3 for seal-finalize + hero flourishes. Add **MediaRecorder API** (native) in Phase 6 for live voice capture — no extra dep.

---

## Scope check

This plan covers five **independent** frontend enhancement streams:
- **Visual polish** (Phases 1–5) — motion, skeletons, typography, a11y, mobile.
- **Doctor workspace restructure** (Phase 6) — 3-phase tabs, 3 input modes, context sidebar, post-visit preview.
- **Missing role surfaces** (Phase 7) — Staff/Receptionist, Admin/Owner.
- **Clinical-safety UI** (Phase 8) — drug-interaction flags, red flags, follow-up, PDPA consent.
- **Post-visit completeness** (Phase 9) — full medication schema + bilingual richness.

Phases 6–9 are the PRD/SAD alignment work. Phases 1–5 are the polish layer. Each phase produces working, testable software on its own.

---

## Spec-to-code gap audit

### A. PRD §1.3 — four stakeholder roles

| Role | PRD expectation | Frontend today |
|---|---|---|
| Doctor | conduct + review + edit AI drafts | ✓ `/doctor`, `/doctor/visits/:id` (but see §B) |
| Patient | symptom chatbot + post-visit viewing | ✓ `/portal`, `/previsit/new`, `/portal/visits/:id` |
| Clinic Staff / Receptionist | manage patient intake, access records | **✗ no surface** |
| Clinic Admin / Owner | user mgmt, analytics | **✗ no surface** |

### B. SAD §2.4.2 — 3 consultation input modes

| Input mode | Frontend today |
|---|---|
| Live voice recording (primary) | **✗ missing** |
| Voice file upload | **✗ missing** |
| Manual text input (fallback) | ✓ textarea only |

Raw transcript must be viewable **before** report generation (SAD §2.4.2) — currently no transcript-review step.

### C. SAD §2.4.2 — drug-interaction check sub-flow

Neo4j returns contraindication flags (`Medication → CONTRAINDICATES → Allergy`, `Medication → INTERACTS_WITH → ActiveMedication`). **Frontend never surfaces them** — if a Paracetamol conflict fires, the doctor never sees it.

### D. SAD §2.4.1–2.4.2 — patient context from graph-KB

Graph-KB multi-hop returns allergies, chronic conditions, recent diagnoses, active medications. Doctor visit page today shows **only** the pre-visit report fields — not the patient's clinical history.

### E. SAD §2.3.2 — medication schema

SAD `medications` table: `name, dosage, frequency, duration, instructions`. Frontend only collects/shows **name, dosage, frequency**. `duration` and `instructions` are **missing** on both doctor-input and patient-view.

### F. SAD §2.4.3 — post-visit agent output

Agent emits: *diagnosis, medication guide, red flags, follow-up*. Frontend today shows **summary text + meds**, but no red-flags block and no follow-up block. Doctor never previews the patient-facing summary before publishing.

### G. PDPA 2010 + SAD §3.2 — consent UI

PDPA requires explicit consent collection. **No consent screen exists.** Footer lacks a privacy link.

### H. Doctor identity in patient view

Post-visit summary should attribute "Signed by Dr. [Name]" for trust. Today we show only a visit hash.

### I. PRD §6 should-haves (time permitting)

- Voice input for symptom intake (patient side) — **✗**
- AI-suggested diagnosis codes / medication autocomplete — **✗**
- In-app follow-up + medication reminders — **✗**
- Admin analytics dashboard — **✗**

### J. PRD §7 out-of-scope — do **not** build

No e-prescribing, no video/telemed, no insurance, no medical-imaging analysis, no appointment booking, no billing, no native apps, no vector-DB / RAG.

### K. Visual / UX weaknesses (PRD-agnostic, but they erode trust in everything else)

| # | Area | Issue |
|---|---|---|
| K1 | AppHeader | No wayfinding, no active-page indicator, no role-coloured chip. |
| K2 | Login | Plain form, no hero, demo creds clutter. |
| K3 | Pre-visit chat | Bubbles monochrome; intake summary is raw key-value dump; no celebratory completion. |
| K4 | Portal visit tiles | `"Visit 8a3f4c21 — (summary being prepared…)"` — identity-less. |
| K5 | Doctor dashboard | Linear tile list; no time grouping; no patient-initial avatar; no surfacing of pre/visit/post phase states per visit. |
| K6 | Doctor visit detail | ~2400px single scroll; finalize buried at bottom; no progress rail; no celebration on finalize. |
| K7 | Empty/loading | Plain `<p>`; no skeletons. |
| K8 | Motion | No `prefers-reduced-motion` guard; no page transitions; landing sets a promise the app can't keep. |
| K9 | Accessibility | `--ink-3` contrast borderline; no focus-visible rings; reveal/rise not gated by reduced-motion. |
| K10 | Mobile | `<640px` breakpoint unverified for hero, doc-grid, med-row, portal-nav. |

---

## File structure

Files this plan will **create**:

*Shared primitives (Phase 1)*
- `frontend/app/components/Skeleton.tsx` — shimmer primitives.
- `frontend/app/components/EmptyState.tsx` — structured empty state with glyph slot.
- `frontend/app/components/Illustration.tsx` — Stethoscope, PillBottle, Envelope, LeafPair, Waveform SVG glyphs.
- `frontend/app/components/PageHeader.tsx` — eyebrow + title + sub + actions.
- `frontend/app/components/RoleChip.tsx` — colour-coded role badge.
- `frontend/app/components/ProgressRail.tsx` — sticky left-rail jump-to-section.
- `frontend/app/components/Motion.tsx` — reduced-motion-safe `<FadeUp/>`, `<Stagger/>` wrappers.

*Doctor workspace (Phase 6)*
- `frontend/app/doctor/components/DoctorNav.tsx` — sub-nav (Today · Queue · Finalized · Patients).
- `frontend/app/doctor/components/VisitRow.tsx` — dashboard row with patient initial + phase dots.
- `frontend/app/doctor/components/PhaseTabs.tsx` — Pre-Visit | Consultation | Post-Visit tab switcher.
- `frontend/app/doctor/components/PatientContextPanel.tsx` — sticky right rail (allergies, conditions, active meds).
- `frontend/app/doctor/components/ConsultationCapture.tsx` — 3-mode input (record / upload / text) with tabs.
- `frontend/app/doctor/components/VoiceRecorder.tsx` — MediaRecorder wrapper with waveform + start/stop/re-record.
- `frontend/app/doctor/components/AudioUpload.tsx` — drag-drop audio file upload.
- `frontend/app/doctor/components/TranscriptReview.tsx` — read-only transcript with "Generate draft" CTA.
- `frontend/app/doctor/components/InteractionFlags.tsx` — red banner list for drug-interaction / contraindication flags.
- `frontend/app/doctor/components/PostVisitPreview.tsx` — bilingual preview card the doctor sees before publishing.
- `frontend/app/doctor/components/FinalizeBar.tsx` — sticky-bottom finalize CTA bar.

*Patient (Phases 3, 9)*
- `frontend/app/portal/components/VisitCard.tsx` — symptom tag + doctor initial.
- `frontend/app/portal/components/MedicationCard.tsx` — pill-bottle glyph, duration, plain-language instructions.
- `frontend/app/portal/components/RedFlagsCard.tsx` — "call the clinic if…" watch-for list.
- `frontend/app/portal/components/FollowUpCard.tsx` — when to come back, next steps.

*New role surfaces (Phase 7)*
- `frontend/app/staff/page.tsx` — receptionist today view (waiting list, check-ins, pre-visit statuses).
- `frontend/app/staff/patients/page.tsx` — patient directory + search.
- `frontend/app/staff/patients/[id]/page.tsx` — single patient record (demographics + visits).
- `frontend/app/staff/components/StaffNav.tsx` — Today · Patients · Appointments-disabled.
- `frontend/app/admin/page.tsx` — admin landing (cards: Users, Analytics, Audit log).
- `frontend/app/admin/users/page.tsx` — user management (list + create + role change).
- `frontend/app/admin/analytics/page.tsx` — adoption/time-saved/acceptance metrics (PRD should-have §6).
- `frontend/app/admin/audit/page.tsx` — read-only audit log view.
- `frontend/app/admin/components/AdminNav.tsx`.

*Consent (Phase 8)*
- `frontend/app/consent/page.tsx` — first-time-patient consent form (PDPA).
- `frontend/app/privacy/page.tsx` — static privacy/PDPA notice.
- `frontend/app/components/ConsentGate.tsx` — client wrapper that routes unconsented patients to `/consent`.

Files this plan will **modify**:
- `frontend/app/globals.css` — ~300 lines: skeleton, reduced-motion guard, role chip colours, phase-tab pill, interaction-flags banner, context-panel sticky, finalize-bar sticky, recorder styles, mobile breakpoints.
- `frontend/app/components/AppHeader.tsx` — children-slot for sub-nav, sticky shadow on scroll, role chip.
- `frontend/app/components/DoctorsSeal.tsx` — `animate?: boolean` prop.
- `frontend/app/login/page.tsx` — 2-col hero grid, collapsible demo creds.
- `frontend/app/page.tsx` — scroll progress bar, emblem parallax, HeroEmblem ring slow-rotate, add privacy link.
- `frontend/app/previsit/new/page.tsx` — warmer bubbles, progress indicator, grouped completion summary, celebration card.
- `frontend/app/portal/page.tsx` — skeletons, use `<VisitCard/>`.
- `frontend/app/portal/visits/[visitId]/page.tsx` — use `<MedicationCard/>`, add red-flags + follow-up + doctor attribution.
- `frontend/app/doctor/page.tsx` — time-grouping + `<DoctorNav/>` + `<VisitRow/>` with phase dots.
- `frontend/app/doctor/visits/[visitId]/page.tsx` — restructure into `<PhaseTabs/>` + right-rail context + 3-mode capture + finalize bar + post-visit preview.
- `frontend/app/layout.tsx` — wrap in `<ConsentGate/>` for patient routes only.
- `frontend/lib/api.ts` — add `apiPostFormData` helper for audio upload (if not present).
- `frontend/lib/auth.ts` — add `STAFF` and `ADMIN` to `AuthUser["role"]` union (already supports `PATIENT | DOCTOR`).

---

## Phase 1 — Shared primitives & accessibility floor *(K7, K8, K9)*

### Task 1.1: Skeleton primitives
**Files:** create `components/Skeleton.tsx`; modify `globals.css`.
- [ ] Add `.skeleton` + `@keyframes shimmer` to globals.
- [ ] Export `<SkeletonLine/>`, `<SkeletonTile/>`, `<SkeletonGrid count={n}/>`.
- [ ] Swap `"Loading…"` strings in portal/page.tsx and doctor/page.tsx for `<SkeletonGrid/>`.
- [ ] Commit `feat(frontend): skeleton loading primitives`.

### Task 1.2: Reduced-motion guard
**Files:** modify `globals.css`.
- [ ] Wrap all keyframe animations + `.reveal` + `.card` rise in `@media (prefers-reduced-motion: reduce)` kill-switch.
- [ ] Verify via DevTools emulation.
- [ ] Commit `fix(frontend): honour prefers-reduced-motion across all pages`.

### Task 1.3: EmptyState + Illustration glyphs
**Files:** create `components/EmptyState.tsx`, `components/Illustration.tsx`; modify `globals.css`, `portal/page.tsx`, `doctor/page.tsx`.
- [ ] Build 5 stroke-only SVG glyphs matching `LeafGlyph` aesthetic.
- [ ] `<EmptyState glyph title body action/>` with CSS for `.empty-state*`.
- [ ] Replace `.portal-empty` + `.doc-empty` call sites.
- [ ] Commit.

### Task 1.4: PageHeader component
**Files:** create `components/PageHeader.tsx`; modify 6 inner pages.
- [ ] Implement with `eyebrow`, `title` (React node), `sub`, `actions`.
- [ ] Replace inline `eyebrow + page-title + page-sub` on all 6 inner pages.
- [ ] Commit.

### Task 1.5: AppHeader role chip + sub-nav slot
**Files:** modify `components/AppHeader.tsx`; create `components/RoleChip.tsx`; modify `globals.css`.
- [ ] Add `children` prop to `AppHeader` rendered as sub-nav below brand.
- [ ] `<RoleChip role={user.role}/>` — colour-coded: PATIENT=primary-soft, DOCTOR=good-soft, STAFF=warn-soft, ADMIN=accent-soft.
- [ ] Sticky shadow via sentinel + IntersectionObserver.
- [ ] Commit.

### Task 1.6: Focus-visible ring pass *(K9)*
**Files:** modify `globals.css`.
- [ ] Add `:focus-visible` 2px `var(--accent)` ring with 2px offset to `.btn`, `.visit-tile`, `.doc-tile`, `.lang-toggle button`, `.portal-nav-tab`, tab/anchor interactives.
- [ ] Keyboard-tab through every page; fix anything without a visible ring.
- [ ] Commit.

---

## Phase 2 — Landing + Login refinement *(K2)*

### Task 2.1: Login 2-col hero
**Files:** modify `login/page.tsx`, `globals.css`.
- [ ] Replace single card with `.auth-grid` (60/40 at ≥900px, stack below).
- [ ] Left rail: `HeroEmblem size=220`, pull quote, 3 trust pills with `LeafGlyph`.
- [ ] Collapse demo creds into `<details>Demo credentials</details>`.
- [ ] Commit.

### Task 2.2: Landing scroll flourishes
**Files:** modify `page.tsx`, `HeroEmblem.tsx`, `globals.css`.
- [ ] Parallax: translate `.land-hero-right` by 10px on scroll, guarded by reduced-motion.
- [ ] `<HeroEmblem/>` dashed-ring rotates 360° / 40s.
- [ ] Fixed 2px top progress bar in `var(--accent)` that grows with scroll.
- [ ] Add `Privacy` link to footer → `/privacy`.
- [ ] Commit.

---

## Phase 3 — Patient journey polish *(K3, K4)*

### Task 3.1: Pre-visit chat warmth + progress
**Files:** modify `previsit/new/page.tsx`, `globals.css`.
- [ ] Add "intake partners" strip above card: You → Intake assistant → Your doctor, with small avatar glyphs.
- [ ] Replace typing dots with organic 3-dot wave keyframe (reduced-motion: static).
- [ ] Add thin progress indicator: `Symptoms · Duration · History · Allergies · Ready` as 5 dots, activating as `structured.fields` keys arrive.
- [ ] Commit.

### Task 3.2: Intake completion card
**Files:** modify `previsit/new/page.tsx`, `globals.css`.
- [ ] Group raw fields into sections: *What's bothering you / How long / Your medicines / Any allergies* — via an explicit `FIELD_TO_SECTION` map.
- [ ] Add "Your doctor will see this before you arrive" card with `<HeroEmblem size={80}/>` that fades in on `done`.
- [ ] Commit.

### Task 3.3: Portal VisitCard extraction + doctor attribution *(K4, H)*
**Files:** create `portal/components/VisitCard.tsx`; modify `portal/page.tsx`; update backend DTO if `doctorName` absent (**precondition**).
- [ ] Extract visit tile; add **symptom tag chip** (from first 2-3 words of `summaryEnPreview` or fallback "General visit").
- [ ] Add **doctor initial badge** ("Dr. N") top-right. If backend lacks `doctorName`, stub "Dr. —" and file backend task.
- [ ] Commit.

---

## Phase 4 — Doctor dashboard polish *(K5)*

### Task 4.1: DoctorNav + phase dots
**Files:** create `doctor/components/DoctorNav.tsx`, `doctor/components/VisitRow.tsx`; modify `doctor/page.tsx`, `globals.css`.
- [ ] DoctorNav tabs: `Today · Queue · Finalized · Patients` (Patients disabled for now if no backend route).
- [ ] VisitRow: patient-initial avatar circle, name, then **3 phase dots**: Pre-Visit ✓/○, Visit ✓/○, Post-Visit ✓/○. Colour-coded.
- [ ] Group visits: "Awaiting your review", "Scheduled today", "Earlier this week", "Signed & filed (collapsed)".
- [ ] Heading counts: "Awaiting your review · 3".
- [ ] Commit.

---

## Phase 5 — Accessibility & mobile *(K9, K10)*

### Task 5.1: Contrast sweep
- [ ] Run Chrome contrast checker on every `var(--ink-3)` usage; darken to `#726c63` if under 4.5:1; re-verify.
- [ ] Ensure `.pill-ghost` meets 3:1 outside status-row.
- [ ] Commit.

### Task 5.2: Mobile breakpoints
**Files:** modify `globals.css`.
- [ ] `@media (max-width: 640px)` blocks for `.land-hero`, `.land-steps`, `.land-diff`, `.doc-grid`, `.portal-nav-tabs` (overflow-x scroll with hidden scrollbar), `.med-row` (2-per-row), `.shell` (32px→20px padding), `<PhaseTabs/>` (horizontal scroll), `<PatientContextPanel/>` (collapsible drawer).
- [ ] Manual screenshot pass at 375px; iterate.
- [ ] Commit.

### Task 5.3: Reduced-motion final verify
- [ ] Re-test every page after Phase 6 additions; guard any new motion.
- [ ] Commit.

---

## Phase 6 — Doctor workspace PRD/SAD alignment ⭐ *(A, B, C, D, F, K6)*

The biggest gap: the doctor page today doesn't reflect SAD §2.4's 3-phase structure, doesn't implement SAD §2.4.2's 3 input modes, doesn't surface drug-interaction flags from the Neo4j sub-flow, doesn't show patient context from the graph-KB, and doesn't preview the post-visit summary before publishing.

### Task 6.1: Visit detail restructure into 3 phase tabs
**Files:** create `doctor/components/PhaseTabs.tsx`; modify `doctor/visits/[visitId]/page.tsx`, `globals.css`.
- [ ] Extract visit detail body into three tabs:
  - **`Pre-Visit Report`** (read-only) — structured symptom summary + history flags from `preVisitStructured`.
  - **`Consultation`** — input-mode tabs (record/upload/text) + transcript review + SOAP editor + meds editor.
  - **`Post-Visit Preview`** — bilingual summary preview + meds preview (disabled/visible until SOAP finalized; enables draft preview after generation).
- [ ] Tab state in URL hash (`#pre`, `#visit`, `#post`) so refresh preserves position.
- [ ] Red "needs your review" dot on tab labels where work is pending.
- [ ] Commit `feat(doctor): split visit detail into pre-visit / consultation / post-visit tabs`.

### Task 6.2: Consultation 3-mode capture *(B)*
**Files:** create `doctor/components/ConsultationCapture.tsx`, `VoiceRecorder.tsx`, `AudioUpload.tsx`, `TranscriptReview.tsx`; modify `lib/api.ts` for `apiPostFormData`.
- [ ] `<ConsultationCapture/>` renders inner tabs: 🎙 Record · 📎 Upload · ⌨ Type. Default: Record.
- [ ] `<VoiceRecorder/>` uses `MediaRecorder` API:
  - Big centred Record button → waveform display while recording → Stop → preview with replay → Send.
  - Shows elapsed time, size, mic-permission banner if denied.
  - Fallback to Upload mode if `navigator.mediaDevices` unavailable.
- [ ] `<AudioUpload/>` drag-drop zone; accept `audio/*`; 20 MB cap; shows filename + size + Send.
- [ ] Text mode keeps existing textarea.
- [ ] After Send, call `POST /api/visits/:id/audio` (multipart) or `POST /api/visits/:id/notes-text`; response is the transcript (or raw text).
- [ ] `<TranscriptReview/>` renders the transcript read-only with `Edit transcript / Generate SOAP draft` buttons — implements SAD §2.4.2 "raw transcript viewable before report generation".
- [ ] Commit `feat(doctor): 3-mode consultation capture (record/upload/text) per SAD §2.4.2`.

### Task 6.3: Patient context sidebar *(D)*
**Files:** create `doctor/components/PatientContextPanel.tsx`; modify `doctor/visits/[visitId]/page.tsx`, `globals.css`.
- [ ] Right sticky rail (≥1200px, collapsible drawer below). Four accordion blocks:
  1. **Allergies** (red dot glyph) — from `/api/patients/:id/context` (backend precondition).
  2. **Chronic conditions** — from graph-KB multi-hop.
  3. **Active medications** — list with dose.
  4. **Recent visits** — last 3 with date + primary diagnosis.
- [ ] Empty-state each block (no bleed to other blocks).
- [ ] If context endpoint 404s, show "Context unavailable" banner — don't block the page.
- [ ] Commit `feat(doctor): patient-context sidebar sourced from graph-KB per SAD §2.4.1`.

### Task 6.4: Drug-interaction + contraindication flags *(C)*
**Files:** create `doctor/components/InteractionFlags.tsx`; modify `doctor/visits/[visitId]/page.tsx`, `globals.css`.
- [ ] After `onGenerate` or any medication edit, call `POST /api/visits/:id/interactions` with current meds (backend precondition — agent returns `{medication, conflictsWith, severity, reason}[]`).
- [ ] Render banner list at the top of the Consultation tab and inline on each `.med-row` when that med has a flag. Severities: `critical` (red), `warn` (amber), `info` (neutral).
- [ ] **Block finalize** if any `critical` severity flag is unacknowledged. "Acknowledge & override" button requires a typed reason (≥8 chars) — that text is posted to `/api/visits/:id/overrides` for audit.
- [ ] Commit `feat(doctor): drug-interaction flag banner with finalize gate per SAD §2.4.2`.

### Task 6.5: Post-Visit Preview *(F)*
**Files:** create `doctor/components/PostVisitPreview.tsx`; modify `doctor/visits/[visitId]/page.tsx`.
- [ ] After SOAP is generated, show a "Generate patient preview" button that calls `POST /api/post-visit/:visitId/draft` (backend precondition — doesn't publish).
- [ ] `<PostVisitPreview/>` renders the bilingual summary, meds, red flags, follow-up — identical layout to the patient's portal view — with a `Looks right` button that gates finalize.
- [ ] If the doctor regenerates SOAP, preview invalidates.
- [ ] Commit `feat(doctor): patient-summary preview before publish per SAD §2.4.3`.

### Task 6.6: Progress rail + finalize bar *(K6)*
**Files:** create `components/ProgressRail.tsx`, `doctor/components/FinalizeBar.tsx`; modify `doctor/visits/[visitId]/page.tsx`.
- [ ] `<ProgressRail/>` — sticky left rail with 4 steps: Intake · Capture · Draft · Publish, active via IntersectionObserver on section ids. Anchors to scroll.
- [ ] `<FinalizeBar/>` — sticky bottom. Shows state: "SOAP draft pending" · "Transcript ready" · "Preview approved" · "Ready to publish →". Button disabled until preview acknowledged AND no critical flags outstanding.
- [ ] On lock, replace bar with centred `<DoctorsSeal animate/>` + "Published to patient at HH:MM".
- [ ] Commit.

### Task 6.7: DoctorsSeal finalize animation
**Files:** modify `components/DoctorsSeal.tsx`, `globals.css`.
- [ ] Add `animate?: boolean`: fade 400ms, stamp scale 0.8→1 overshoot 120ms, `<textPath>` draws via stroke-dashoffset 900ms.
- [ ] Guard all with `prefers-reduced-motion: reduce`.
- [ ] Commit.

---

## Phase 7 — Missing role surfaces ⭐ *(A, PRD §1.3)*

Backend precondition: `users.role` already supports 4 values; Spring Security routes must grant `STAFF` and `ADMIN` access to new endpoints. This plan assumes backend endpoints are stubbed where noted.

### Task 7.1: Staff (receptionist) workspace
**Files:** create `staff/page.tsx`, `staff/components/StaffNav.tsx`, `staff/patients/page.tsx`, `staff/patients/[id]/page.tsx`.
- [ ] `/staff` — today's waiting-list view: patients arrived, pre-visit status dots, check-in button per row. List sourced from `/api/staff/today` (backend stub if missing).
- [ ] StaffNav tabs: `Today · Patients`.
- [ ] `/staff/patients` — searchable list sourced from `/api/patients?q=`. Search debounced 250ms.
- [ ] `/staff/patients/:id` — read-only patient record (demographics + visits list). No mutations (staff doesn't edit clinical data).
- [ ] Login redirect: `role === "STAFF"` → `/staff`.
- [ ] Commit `feat(staff): receptionist workspace per PRD §1.3`.

### Task 7.2: Admin workspace
**Files:** create `admin/page.tsx`, `admin/components/AdminNav.tsx`, `admin/users/page.tsx`, `admin/analytics/page.tsx`, `admin/audit/page.tsx`.
- [ ] `/admin` — three cards: User management · Analytics · Audit log.
- [ ] AdminNav tabs: `Overview · Users · Analytics · Audit`.
- [ ] `/admin/users` — list + create (email, name, role, initial password) + role-change. Posts to `/api/admin/users` (backend stub).
- [ ] `/admin/analytics` — simple KPI cards (no chart library yet): *visits finalized this week*, *avg doctor review time*, *AI draft acceptance rate*, *patients served*. PRD should-have §6.
- [ ] `/admin/audit` — paginated read-only audit log view. Filters: user · action · date range. Never mutate.
- [ ] Login redirect: `role === "ADMIN"` → `/admin`.
- [ ] Commit `feat(admin): admin workspace per PRD §1.3 + §6 should-haves`.

### Task 7.3: AppHeader role-aware home + sub-nav
**Files:** modify `components/AppHeader.tsx`.
- [ ] Extend `home` routing to include `STAFF → /staff`, `ADMIN → /admin`.
- [ ] Role-coloured `<RoleChip/>` matches the role's accent on header + nav tabs.
- [ ] Commit.

---

## Phase 8 — Clinical safety UI ⭐ *(F, G)*

### Task 8.1: Red flags + follow-up in patient view
**Files:** create `portal/components/RedFlagsCard.tsx`, `FollowUpCard.tsx`; modify `portal/visits/[visitId]/page.tsx`; backend precondition on Post-Visit DTO.
- [ ] Backend `postVisitSummary` DTO should include `redFlags: string[]` and `followUp: { when: string, instruction: string }`. Frontend assumes and falls back to empty arrays.
- [ ] `<RedFlagsCard/>` — red-bordered card "Come back sooner if:" list with AlertGlyph. EN/MS localised.
- [ ] `<FollowUpCard/>` — green-bordered "Next step" card with when + what.
- [ ] Render on both patient view and doctor's `<PostVisitPreview/>`.
- [ ] Commit.

### Task 8.2: Doctor attribution on patient view *(H)*
**Files:** modify `portal/visits/[visitId]/page.tsx`; backend precondition.
- [ ] Pull `doctorName` + `doctorInitials` into the `Detail` DTO.
- [ ] Render "Signed by Dr. Nadia Rahim · 4 Apr 2026" under summary card. Bilingual.
- [ ] Commit.

### Task 8.3: PDPA consent gate *(G)*
**Files:** create `consent/page.tsx`, `privacy/page.tsx`, `components/ConsentGate.tsx`; modify `layout.tsx`, `login/page.tsx`.
- [ ] `/consent` — simple form with 3 checkboxes (data use, graph-KB storage, AI processing), "I agree" button. POSTs to `/api/patient/consent` with timestamp (backend precondition; write to audit_log).
- [ ] `/privacy` — static page summarising PDPA obligations, data retention, deletion requests. Reachable from landing footer + login footer.
- [ ] `<ConsentGate/>` — client component around patient-only routes (`/portal`, `/previsit/*`). If `user.role === "PATIENT" && !user.consentGiven`, redirect to `/consent`.
- [ ] Login response DTO should include `consentGiven: boolean` (backend precondition).
- [ ] Commit.

---

## Phase 9 — Post-visit completeness *(E, F)*

### Task 9.1: Medication schema round-trip *(E)*
**Files:** modify `doctor/visits/[visitId]/page.tsx`, `portal/visits/[visitId]/page.tsx`, `portal/components/MedicationCard.tsx`; backend precondition on `medications` DTO.
- [ ] Doctor input: per-med row adds `Duration` (e.g. "5 days") and `Instructions` (free text, e.g. "Take with food").
- [ ] Patient view `<MedicationCard/>` — 2-col grid on desktop, single on mobile, each card shows: PillBottleGlyph, name, dose, frequency (with expansion: `TDS → three times a day`), **duration**, **instructions**. Bilingual.
- [ ] Parse common frequency codes in a small table: `TDS/TID`, `BD/BID`, `OD/QD`, `PRN`, `QID`.
- [ ] Commit.

### Task 9.2: Bilingual richness polish
**Files:** modify `portal/visits/[visitId]/page.tsx`.
- [ ] Translations: red-flags card, follow-up card, medication card labels, doctor-attribution line.
- [ ] Smooth lang toggle transition (fade 180ms).
- [ ] Commit.

---

## Out of scope (explicit — PRD §7)

- e-prescribing / pharmacy integration
- Telemedicine video
- Insurance claims
- Medical imaging analysis
- Full EHR replacement
- Appointment booking / scheduling (admin analytics is fine, creating appointments is not)
- Billing / payment
- Native iOS/Android apps
- Vector DB / RAG
- Dark mode (deferred visual polish, not a PRD item)

---

## Acceptance criteria

The plan is complete when:

**Spec alignment**
1. Every PRD stakeholder role from §1.3 has a default landing route: Patient (`/portal`), Doctor (`/doctor`), Staff (`/staff`), Admin (`/admin`).
2. Doctor consultation supports all 3 input modes (record / upload / text) from SAD §2.4.2, with raw transcript shown before report generation.
3. Drug-interaction flags from the Neo4j sub-flow render in the doctor UI, and critical flags block finalize until an override reason is logged.
4. Patient graph-KB context (allergies / conditions / active meds / recent visits) is visible during consultation.
5. Doctor can preview the patient-facing bilingual summary + red flags + follow-up + meds **before** publishing.
6. Medications carry the full schema (`name, dosage, frequency, duration, instructions`) both in doctor input and patient view.
7. PDPA consent is collected on first patient login, and privacy page is linked from landing + login.
8. Patient visit view shows the signing doctor's name.

**Visual / UX**
9. Manual screenshot comparison shows clear visual improvement on `/`, `/login`, `/portal`, `/portal/visits/:id`, `/previsit/new`, `/doctor`, `/doctor/visits/:id`, `/staff`, `/admin`.
10. Lighthouse accessibility ≥ 95 on `/`, `/login`, `/portal`, `/doctor`.
11. `prefers-reduced-motion: reduce` disables all animations > 80ms across every page.
12. 375px mobile renders every page without horizontal scroll or clipped content.
13. `npm run build` and `npm run lint` pass.

---

## Backend preconditions (must exist before the matching phase runs)

These are **not** frontend work — they're flagged so the backend track can run in parallel and not block us:

- **Phase 6.2** — `POST /api/visits/:id/audio` (multipart) returning transcript.
- **Phase 6.3** — `GET /api/patients/:id/context` returning `{allergies, conditions, activeMeds, recentVisits}`.
- **Phase 6.4** — `POST /api/visits/:id/interactions` returning `{flags:[{medication,conflictsWith,severity,reason}]}`; `POST /api/visits/:id/overrides`.
- **Phase 6.5** — `POST /api/post-visit/:visitId/draft` returning preview (no persist).
- **Phase 7.1** — `GET /api/staff/today`, `GET /api/patients?q=`, `GET /api/patients/:id`.
- **Phase 7.2** — `GET/POST /api/admin/users`, `GET /api/admin/analytics`, `GET /api/admin/audit`.
- **Phase 8.1** — extend `PostVisitSummaryDTO` with `redFlags: string[]`, `followUp: {when, instruction}`.
- **Phase 8.2** — extend visit DTO with `doctorName`, `doctorInitials`.
- **Phase 8.3** — `POST /api/patient/consent`; extend login response with `consentGiven`.
- **Phase 9.1** — extend `MedicationDTO` with `duration`, `instructions`.

Where a precondition is missing, the frontend should **stub gracefully** (empty state, fallback label, banner "Data unavailable") — never hard-fail.

---

## Execution order recommendation

Run in spec-priority order, not visual-priority order, because the PRD/SAD gaps are the real weakness:

**Phase 1 → Phase 6 → Phase 8 → Phase 9 → Phase 7 → Phases 2, 3, 4, 5**

This gets the doctor workspace aligned with SAD §2.4 first (biggest spec gap), then wires in clinical-safety surfaces, then completes the patient view, then adds the missing roles, and only then layers visual polish on the now-correct surface.

---

## Self-review notes

- Spec coverage checked against: PRD §1.3 (roles), §5 (user stories US-P/D/R/O), §6 (should-haves), §7 (out-of-scope); SAD §2.1–§2.4, §3.2.
- No placeholders — every task names exact files and commit verb.
- Types consistent — `role` union is `PATIENT | DOCTOR | STAFF | ADMIN` everywhere.
- Where backend doesn't yet return a field, the plan says **stub gracefully** rather than skip the UI.
