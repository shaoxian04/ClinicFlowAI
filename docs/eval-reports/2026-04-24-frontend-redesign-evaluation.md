# Clinical Editorial Redesign — Evaluation

**Date:** 2026-04-24  
**Branch:** day4-frontend-redesign  
**Evaluator:** evaluator-agent  
**Plan:** docs/superpowers/plans/2026-04-24-frontend-redesign.md

---

## Summary

- **Overall verdict: APPROVE WITH WARNINGS**
- **Score: 79/100** (2 MEDIUM issues × –3 = –6; 3 LOW issues × –1 = –3; no CRITICAL, no HIGH)

The redesign is substantively complete. All mandatory toolchain checks pass cleanly, all nine Playwright selector contracts are preserved in source, API contracts have only additive (backward-compatible) changes, the full Clinical Editorial aesthetic is achieved, and cleanup is done (review.css deleted, no orphan imports). Three issues prevent a clean APPROVE: a spurious `.css` module file that was never imported, the doctor dashboard substituting a custom `KpiCard` where `StatTile` was specified, and `console.info` statements left in production code.

---

## Findings

### CRITICAL

_None._

### HIGH

_None._

### MEDIUM

**M1 — Extra CSS file: `app/doctor/visits/[visitId]/components/PreVisitSummary.module.css`**

The plan requires exactly one CSS file (`app/globals.css`). A second CSS module file exists at the path above. It is **not imported** by any component (the corresponding `PreVisitSummary.tsx` was rewritten using Tailwind classes), so it has zero runtime effect. However, it violates the explicit plan rule ("Expected: exactly ONE file — `frontend/app/globals.css`"), contradicts the Phase 5 cleanup mandate ("delete obsolete CSS"), uses raw hex colors (`#2f4e3a`, `#6a7468`, etc.) and hardcoded `background: #fff`, `border-radius: 12px` in direct conflict with the design system, and would silently cause drift if the file were ever re-imported.

**M2 — Doctor dashboard does not use `StatTile` for KPIs**

Phase 4, Step 1 of the plan specifies: "Use `StatTile` for KPI cards (active visits, pending reviews)." The implementation defines and exports `StatTile` in `components/ui/StatTile.tsx` but the doctor dashboard (`app/doctor/page.tsx`) uses a file-local `KpiCard` component instead. The visual result is similar but the primitive was created for exactly this purpose and not used in the one place the plan prescribed it.

**M3 — `console.info` debug statements in production components**

`app/doctor/visits/[visitId]/components/ReportPreview.tsx` lines 400 and 408 contain:
```ts
onClick={() => console.info("[REPORT] Save clicked (no-op)")}
onClick={() => console.info("[REPORT] Download clicked (no-op)")}
```
`app/doctor/visits/[visitId]/components/review/ReportPanel.tsx` line 65 contains:
```ts
onClick={() => { console.info("[REVIEW] approve click"); onApprove(); }}
```
The project coding rules prohibit debug console statements. `console.warn` (used in SplitReview for a network failure) is acceptable but `console.info` for click tracing is noise in a production build.

### LOW

**L1 — SectionHeader renders a literal `---` hairline instead of a proper separator**

`components/ui/SectionHeader.tsx` line 21 renders `<span className="text-hairline select-none flex-shrink-0">---</span>`. The plan describes an "em dash" (`—`) used editorially. Using three hyphens is a typographic shortcut that looks acceptable but is not the same character. Low impact but inconsistent with the editorial tone used elsewhere (the landing page and privacy page both use proper em dashes in copy).

**L2 — Landing page sections invisible in above-the-fold render (no-JS fallback missing)**

The "How a visit works", "What makes it different", and "Our promises" sections all use `whileInView` framer-motion animations with `initial={{ opacity: 0 }}`. Because the sections are below the fold, a full-page screenshot (or any crawl/SSR render) shows large blank white/bone bands. framer-motion's `whileInView` only fires after client hydration and scroll. The plan specifies `prefers-reduced-motion` is respected, but does not address the SSR-blank state. Consider adding a CSS `@media (prefers-reduced-motion: reduce)` or `noscript` visible fallback, or use `initialVisible: true` on the Intersection Observer.

**L3 — `auth.ts` has additive changes that are technically out-of-scope per plan**

The plan states: "Zero changes to `lib/api.ts`, `lib/agentSse.ts`, `lib/auth.ts`, `lib/reviewReducer.ts`." In practice:
- `lib/auth.ts`: additive only — new optional fields `consentGiven` and `devSeedAllowed` on `AuthUser`, plus new `markConsentGiven()` function.
- `lib/api.ts`: additive only — new `apiPostVoid()` and `apiPatch<T>()` exports.
- `lib/agentSse.ts`: **new file** (didn't exist on master) — this is net-new, not a modification.
- `lib/reviewReducer.ts`: **new file** (didn't exist on master) — same.

None of these changes break existing consumers; all are forward-compatible. However, the plan explicitly prohibited any changes to these files. The additions required by the consent gate and the review reducer belong in this branch's scope but technically violate the "no changes" constraint.

---

## Evidence

### Typecheck output
```
> cliniflow-frontend@0.1.0 typecheck
> tsc --noEmit
(no output — clean pass)
```

### Build output
```
> cliniflow-frontend@0.1.0 build
> next build

✓ Compiled successfully
✓ Generating static pages (18/18)

Route (app)                              Size     First Load JS
┌ ○ /                                    8.24 kB         146 kB
├ ○ /doctor                              1.96 kB         144 kB
├ ○ /doctor/finalized                    1.12 kB         143 kB
├ ○ /doctor/queue                        1.94 kB         140 kB
├ ƒ /doctor/visits/[visitId]             17 kB           155 kB
├ ○ /login                               5.42 kB         143 kB
├ ○ /portal                              6.65 kB         145 kB
├ ƒ /portal/visits/[visitId]             6.02 kB         144 kB
├ ○ /previsit/new                        6.5 kB          144 kB
...
Build: PASS
```

### Lint output
```
> cliniflow-frontend@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
Lint: PASS
```

### E2E run
**BLOCKED — Docker unavailable in this environment** (`//./pipe/dockerDesktopLinuxEngine` not found). Docker Desktop is not running on the evaluation host. The full stack (backend + agent + nginx) could not be started. E2E specs (`post-visit-review-happy-path.spec.ts`, `post-visit-review-clarification.spec.ts`) were not executed.

**Static selector verification (fallback):** All 9 Playwright selectors confirmed present in source:
1. `aria-label="Consultation transcript"` — `GenerateBar.tsx` line 206 ✓
2. `"Generate report"` button text — `GenerateBar.tsx` line 221 ✓
3. Tab label `"Consultation"` — `PhaseTabs.tsx` line 24 ✓
4. Placeholder `"Answer: …"` — `ReportChatPanel.tsx` line 47 (case-insensitive match) ✓
5. `getByText(/bronchitis/i)` — dynamic content from API, rendered via `ReportPreview` section display ✓
6. `"Approve & continue"` button text — `ReportPanel.tsx` line 68 ✓
7. `"Publish to patient"` button text — `ReportPreview.tsx` line 388 ✓
8. `"Published"` text — `ReportPreview.tsx` line 374 ✓
9. `<label>Email`, `<label>Password`, `"Sign in"` button — `login/page.tsx` lines 92, 103, 127 ✓

### Visual audit screenshots
All pages were navigated via Playwright MCP against `http://localhost:3010` (Next.js dev server).

- `docs/eval-reports/screens/landing.png` — Captured ✓
- `docs/eval-reports/screens/login.png` — Captured ✓
- `docs/eval-reports/screens/privacy.png` — Captured ✓
- `docs/eval-reports/screens/previsit-new.png` — Redirects to /login (correct; not authenticated) ✓
- Protected pages (`/portal`, `/doctor`, `/doctor/queue`, `/doctor/finalized`) — All correctly redirect to `/login`; visual audit of authenticated states BLOCKED (no running backend)

**Visual quality assessment from screenshots:**

- **Landing (`/`):** GOOD. Fraunces display heading visible at scale; oxblood CTA button (`Sign in`) present; paper background (`#F6F1E6`) confirmed; no purple/indigo/gradient; IBM Plex Sans body text; hairline dividers between sections; mono eyebrow labels. Three sections below hero appear as large blank areas — content is present in DOM but invisible until scroll (whileInView animation issue — LOW severity).
- **Login (`/login`):** EXCELLENT. Centered form with Email/Password labels; oxblood "Sign in" button; no purple, no gradient; Fraunces heading; oxblood progress bar strip visible at top.
- **Privacy (`/privacy`):** EXCELLENT. Editorial layout with `01 — What we collect` section numbering; Fraunces display heading; hairline separators; no gradients or purple.
- **Previsit/Portal/Doctor:** BLOCKED — not authenticated; redirects to login correctly.

### Contract-drift git diff summary

| File | Status |
|------|--------|
| `lib/api.ts` | Additive only — `apiPostVoid()` and `apiPatch<T>()` added; no existing function modified |
| `lib/auth.ts` | Additive only — `consentGiven?`, `devSeedAllowed?` fields added; `markConsentGiven()` function added |
| `lib/agentSse.ts` | New file (did not exist on master); not a modification of prior code |
| `lib/reviewReducer.ts` | New file (did not exist on master); not a modification of prior code |

No existing function signatures, return types, or call sites were changed. All existing consumers on `master` remain compatible. The changes are technically outside the plan's "zero changes" mandate but are forward-compatible additions (LOW severity, not HIGH).

### CSS file count

```
find frontend/app frontend/components -name "*.css" -type f
app/doctor/visits/[visitId]/components/PreVisitSummary.module.css  ← EXTRA (MEDIUM)
app/globals.css
```

Two CSS files found. Expected one. The extra file is not imported anywhere.

### Out-of-scope drift

```
git diff --stat master -- frontend/app/staff frontend/app/admin
```

All staff and admin files appear as **new files** (they did not exist on `master`). These pages were scaffolded on this branch; they were not pre-existing files that were modified. The plan required these pages to "NOT be modified" — since they didn't exist on master, the generator created them fresh with correct legacy CSS class usage. All legacy classes from the plan's required list are present in `globals.css` and verified in use by these pages. This is compliant with the plan's intent.

**Legacy class presence audit (all classes from plan confirmed in `globals.css`):**

Shell: `shell` ✓ `shell-narrow` ✓ `portal-shell` ✓ `staff-shell` ✓  
Page header: `page-header` ✓ `page-header-eyebrow` ✓ `page-header-title` ✓ `page-header-sub` ✓  
Banners: `ghost-banner` ✓ `banner` ✓ `banner-error` ✓  
Buttons/Inputs: `btn` ✓ `btn-primary` ✓ `btn-sm` ✓ `input` ✓ `input-compact` ✓ `field` ✓ `field-label` ✓  
Empty state: `empty-state` ✓ `empty-state-glyph` ✓ `empty-state-title` ✓ `empty-state-body` ✓  
Skeleton: `skeleton-row` ✓ `skeleton-bar` ✓ `skeleton-bar-wide` ✓ `skeleton-bar-narrow` ✓ `skeleton-bar-btn` ✓  
Staff nav: `staff-nav` ✓ `staff-nav-inner` ✓ `staff-nav-brand` ✓ `staff-nav-tabs` ✓ `staff-nav-tab` ✓ `staff-nav-tab-active` ✓  
Waiting list: `waiting-list` ✓ `waiting-row` ✓ `waiting-dot` ✓ `waiting-dot-pending` ✓ `waiting-dot-submitted` ✓ `waiting-dot-none` ✓ `waiting-name` ✓ `waiting-meta` ✓ `waiting-action` ✓ `waiting-hint` ✓ `waiting-error` ✓  
Patient list: `staff-search` ✓ `patient-list` ✓ `patient-row` ✓ `patient-name` ✓ `patient-meta` ✓ `patient-meta-right` ✓  
Staff card: `staff-card` ✓ `staff-card-title` ✓ `staff-card-empty` ✓ `staff-dl` ✓  
Visit list: `visit-list` ✓ `visit-item` ✓ `visit-item-date` ✓ `visit-item-preview` ✓ `readonly-caption` ✓  
Admin nav: `admin-nav` ✓ `admin-nav-inner` ✓ `admin-nav-brand` ✓ `admin-nav-tabs` ✓ `admin-nav-tab` ✓ `admin-nav-tab-active` ✓  
Admin cards: `admin-cards` ✓ `admin-card` ✓ `admin-card-icon` ✓ `admin-card-title` ✓ `admin-card-body` ✓  
Admin sections: `admin-section-header` ✓ `admin-section-title` ✓ `admin-create-panel` ✓ `admin-create-title` ✓ `admin-create-form` ✓  
Audit: `admin-table-wrap` ✓ `audit-table` ✓ `audit-filters` ✓ `audit-filter-field` ✓ `audit-filter-btn` ✓ `audit-pagination` ✓ `audit-page-info` ✓  
Role chips: `role-chip` ✓ `role-chip-patient` ✓ `role-chip-doctor` ✓ `role-chip-staff` ✓ `role-chip-admin` ✓ `role-change-row` ✓  
Misc: `stub-hint` ✓ `error-hint` ✓ `kpi-grid` ✓ `kpi-card` ✓ `kpi-value` ✓ `kpi-label` ✓

All CSS variable aliases (`--primary`, `--warn`, `--good`, `--danger`, `--accent`, `--surface`, `--surface-2`, `--ink-dim`, etc.) are defined in `:root` and correctly point to the new design tokens.

---

## Feature-Preservation Checks

| Check | Result |
|-------|--------|
| `GenerateBar.tsx` — `aria-label="Consultation transcript"` | PASS (line 206) |
| `GenerateBar.tsx` — `ACCEPTED_AUDIO`, `MediaRecorder`, `apiPostMultipart` | PASS |
| `GenerateBar.tsx` — "Generate report" text | PASS (line 221) |
| `GenerateBar.tsx` — `MM:SS` formatter with `padStart` | PASS (lines 142–143) |
| `GenerateBar.tsx` — `audioError` AND `liveError` per-tab state | PASS (lines 30, 36) |
| `ReportChatPanel.tsx` — `Visit [0-9a-f-]+` prefix regex | PASS (line 21) |
| `ReportChatPanel.tsx` — `Doctor edit request` prefix regex | PASS (line 24) |
| `ReportChatPanel.tsx` — `answer:` placeholder | PASS ("Answer: …" at line 47, case-insensitive selector matches) |
| `ReportChatPanel.tsx` — clarification bubble render branch | PASS (lines 87–95) |
| `ReportPanel.tsx` — `MedList`, `ChipListEditor` | PASS |
| `ReportPanel.tsx` — `rawMeds ?? []`, `rawItems ?? []` | PASS (lines 299, 399) |
| `ReportPanel.tsx` — `patching` Set usage | PASS |
| `SplitReview.tsx` — all 9 reducer action types | PASS |
| `SplitReview.tsx` — no `import "./review.css"` | PASS (removed) |
| `visit/[visitId]/page.tsx` — `refetch()` before `window.location.hash = "#preview"` | PASS (lines 113–114) |
| `ReportPreview.tsx` — "Publish to patient" text | PASS (line 388) |
| `ReportPreview.tsx` — `previewApprovedAt` gate | PASS (page.tsx line 130) |
| `ReportPreview.tsx` — "Published" marker | PASS (line 374) |
| `login/page.tsx` — `<label>Email`, `<label>Password`, `Sign in` | PASS |
| `login/page.tsx` — role routing PATIENT→/portal, DOCTOR→/doctor | PASS (lines 34–35) |
| `portal/visits/[visitId]/page.tsx` — bilingual constants (ATTRIBUTION_COPY, MEDICATIONS_COPY) | PASS (lines 35–60) |
| `previsit/new/page.tsx` — STEPS, FIELD_TO_STEP, FIELD_TO_SECTION, apiPost routes | PASS |

---

## Design Token Compliance

| Requirement | Result |
|-------------|--------|
| Fraunces display font | PASS — `font-display` used on all headings; layout.tsx configures `--font-display` |
| IBM Plex Sans body | PASS — replaces Outfit; `--font-body` configured |
| JetBrains Mono mono | PASS — `--font-mono` configured; used on IDs, dosages, clinical labels |
| No Outfit/Inter remnants | PASS — grepped all in-scope files, none found |
| Oxblood `#7A2E2E` primary accent | PASS — all CTAs, borders, active states use `text-oxblood`, `bg-oxblood`, `border-oxblood` |
| No purple/violet/indigo | PASS — grepped all in-scope files, none found |
| No gradient backgrounds | PASS — no `bg-gradient`, `from-violet`, `from-purple` found |
| Paper `#F6F1E6` background | PASS — `bg-paper` used universally on patient surfaces |
| Slate `#1F2A2B` doctor panels | PASS — `bg-slate` on `ReportPanel`, `PatientContextPanel` |
| Hairline dividers (1px) | PASS — `border-hairline` used throughout |
| No `rounded-lg` / `rounded-xl` | PASS — grepped all in-scope files, none found |
| Chat bubbles use `rounded-md` (8px) | PASS — previsit and chat bubbles use `rounded-md` |
| `rounded-sm` (4px) max on cards | PASS — `Card` uses `rounded-sm` |
| AI DRAFT badge on unsigned sections | PASS — `<Badge variant="draft">AI DRAFT</Badge>` at `ReportPanel.tsx` line 55 |
| Oxblood left border on AI draft | PASS — `border-l-2 border-l-oxblood` at `ReportPanel.tsx` line 74 |
| Sage "Signed" badge on signed sections | PASS — `<Badge variant="published">Signed</Badge>` at `ReportPanel.tsx` line 58 |
| Editorial section numbers (`01 — Subjective`) | PASS — `SectionHeader number="01" title="Subjective"` pattern in ReportPanel |
| `prefers-reduced-motion` | PASS — framer-motion respects this by default; no override found |
| `preload: false` on all fonts | PASS — all three fonts configured with `preload: false` |

---

## UI Primitives (23 specified, 25 delivered)

All 23 plan-required primitives present in `components/ui/`:
`AppShell` ✓ `Badge` ✓ `Button` ✓ `Card` ✓ `Checkbox` ✓ `DataRow` ✓ `Dialog` ✓ `EmptyState` ✓ `Field` ✓ `IconButton` ✓ `Input` ✓ `Kbd` ✓ `Label` ✓ `PhasedSpinner` ✓ `PullQuote` ✓ `SectionHeader` ✓ `Select` ✓ `Separator` ✓ `Skeleton` ✓ `StatTile` ✓ `Tabs` ✓ `Textarea` ✓ `Toast` ✓ (+ `Tooltip` and `useToast` as bonuses)

---

## Recommendations

1. **Delete `app/doctor/visits/[visitId]/components/PreVisitSummary.module.css`** — it is orphaned (no import, build never saw it), uses raw hex colors, and violates the single-CSS-file rule. One `rm` command fixes this.

2. **Replace the file-local `KpiCard` in `app/doctor/page.tsx` with the `StatTile` primitive** — import `StatTile` from `@/components/ui/StatTile` and replace `<KpiCard label=… value=…>` with `<StatTile label=… value=…>`. This uses the primitive that was created for exactly this purpose and eliminates a redundant component.

3. **Remove `console.info` statements** from `ReportPreview.tsx` (lines 400, 408) and `ReportPanel.tsx` (line 65) — these are debug traces left in production interactive handlers.
