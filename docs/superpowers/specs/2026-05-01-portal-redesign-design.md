# Portal Redesign — Patient & Doctor Dashboards

**Date:** 2026-05-01
**Branch:** `feat/appointment-booking-and-reminders` (continuation)
**Goal:** Restructure the patient and doctor portals into hackathon-judge-grade dashboards. Surface the new appointment booking flow, add data visualizations, and clarify navigation. Aurora-glass dark/cyan theme is preserved.

---

## 1. Context & motivation

Both portals shipped with the appointment-booking work but the dashboards never caught up:
- **Patient portal** (`/portal`) shows only a hero greeting + 3-tile KPI strip + previous-consultations list. Booked appointments are invisible from the home screen — the user explicitly reported "I can't view the appointment I have made."
- **Doctor portal** (`/doctor`) shows a 3-tile KPI strip + 4-tab queue list. The "Awaiting review" rows show pre-visit submission timestamps with no booking context, which is confusing. No data viz, no schedule rail, no visible appointment surface.
- Patient navigation has only 2 tabs (Home, New pre-visit chat). Past consultations and the new appointment pages are not reachable from the chrome.
- Doctor nav labels (Visits / Today / Queue) are ambiguous and don't match on-page headings.

Hackathon judges will look at the dashboards first. Today they look like CRUD tables. Target: "Linear-meets-clinical" — high-signal hero card, one chart, structured secondary modules, story-of-the-day feel.

## 2. Out of scope

- Backend schema changes (uses existing data only).
- Mobile redesign (responsive grids degrade gracefully but mobile-specific layouts are deferred).
- Real-time updates / WebSockets — pages refetch on mount and on explicit user action.
- Notifications inbox / message center.
- Patient-side health vitals (weight, BP) — out of scope for this iteration.

## 3. Design direction

**Direction C: Hybrid** — adopted in brainstorming. Hero card carries the most important "next thing" + one supporting chart, KPI strip becomes a small accent (not the headline), and modules below stack in priority order. Reuse the obsidian/ink-well/ink-rim/cyan/fog/fog-dim/crimson palette. No new colors, no new fonts.

**Layout principle:** Two-column 5/4 grid for paired modules (hero + chart, schedule + donut). Stacks to one column on `<md` breakpoints.

## 4. Doctor portal — `/doctor`

### Module stack (top → bottom)

1. **Hero band — `Next Up` card + `Visits-per-day` chart** (5/4 grid)
   - **Next Up card:** the next BOOKED appointment for today, ordered by `startAt` ASC. Shows time, patient name, age + gender (if available), `NEW_SYMPTOM` / `FOLLOW_UP` badge, and a `PRE-VISIT READY ✓` indicator if the visit's pre-visit report has `done=true`. Primary CTA: `Open chart →` linking to `/doctor/visits/{visitId}`. Empty state ("No more appointments today") when the rest-of-day list is empty.
   - **Visits chart:** 14-day finalized-visits area chart, cyan stroke + faint cyan fill on obsidian. Below the chart: total + delta vs prior 14d ("15 finalized · ↑ 23%"). Built with inline SVG — no chart lib (keeps bundle small + theme-pure).
2. **KPI strip** (4 tiles, ¼ each)
   - Awaiting review · Today's bookings · Finalized this week · Avg time-to-finalize. Click-through to the relevant tab/page.
3. **Secondary band — `Today's schedule` rail + `Condition mix` donut** (5/4 grid)
   - **Schedule rail:** vertical timeline of today's BOOKED appointments. Each row: time · patient · status badges (PRE ✓ if pre-visit done, DRAFT if AI draft exists). Past slots fade to fog-dim/40, current slot has cyan dot + slightly brighter background. Empty state with "Today's grid is clear" message.
   - **Condition mix donut:** Last 30 days. Top 5 chief complaints from finalized SOAP notes. Donut chart on the left, color-coded legend on the right (cyan + 4 fog tints).
   - **Data extraction note:** chief complaints come from `medical_reports.subjective` text. For MVP, extract via a simple keyword/heuristic (top n-grams or fixed-list match against {URTI, headache, fever, diabetes f/u, hypertension f/u, etc.}). If a finalized report has no parseable complaint, bucket as "Other". This avoids needing a real NLP service.
4. **Awaiting your review queue** — replaces the existing tabbed list as a standalone section (keep the existing 4 tabs at the bottom of the page for the other states).
   - Each row: patient name + `AI DRAFT` badge + **draft age** (e.g. "Drafted 2h ago" — from `medical_reports.gmt_modified` or `gmt_create` whichever is newer). Removes the confusing pre-visit submission timestamp.
   - Sort: oldest draft first (encourages clearing the queue from oldest end).
5. **Recently finalized strip** — horizontal scrollable strip of the last 5 finalized visits. Each card: patient · chief complaint · finalized timestamp. Click → re-open `/doctor/visits/{visitId}`.

### Doctor nav

```
CLINICIAN WORKSPACE   Dashboard | Today's schedule | Awaiting review | Finalized | Patients
```

Renames vs current chrome:
- `Visits` → `Dashboard` (this redesigned page)
- `Today` → `Today's schedule`
- `Queue` → `Awaiting review`

`Finalized` and `Patients` keep their existing destinations and labels.

## 5. Patient portal — `/portal`

### Module stack (top → bottom)

1. **Next-appointment hero card** (full width)
   - If there's a BOOKED appointment for the patient with `startAt > now`: shows a big card with countdown (`In 3 days · Mon, 4 May 09:00 am`), doctor name (single-doctor MVP: `Dr. Demo`), duration, `NEW_SYMPTOM` / `FOLLOW_UP` badge, and two CTAs: `View details →` (deep-link to `/portal/appointments/{id}`) and `Cancel` (only if cancellable per the existing 2h lead-time rule).
   - If no booking: card shows "No upcoming appointments" + a primary `Book an appointment` CTA.
   - This module fixes the "I can't view the appointment I have made" gap directly.
2. **Quick actions row** (3 tiles, ⅓ each)
   - `Start pre-visit chat →` `/previsit/new`
   - `Book appointment →` `/portal/book` (or pre-visit chat first if no visit context)
   - `Update phone & consent →` `/portal/profile`
3. **Health snapshot strip** (4 tiles, ¼ each)
   - Past consultations (count) · Active medicines (count, last 14d) · Allergies (count, from clinical baseline) · Last visit (date). Each tile is clickable to a relevant detail page.
4. **Visit timeline** (chart, full width)
   - Horizontal timeline of the last 6-12 months. Dots for finalized visits (cyan filled), dots for upcoming bookings (cyan ring outline). Hover → tooltip with date + 1-line summary (chief complaint or `Booked`). Built as inline SVG; data drawn from existing `/api/patient/visits` + `/api/appointments/mine`.
   - Empty state: "Your visit timeline will appear here as you complete consultations."
5. **Previous consultations list** (existing module, restyled)
   - Reuses the existing `VisitCard` component but wraps it in the new section style. No data changes.

### Patient nav

```
YOUR PORTAL   Home | Appointments | Visit history | Profile        [Start pre-visit chat →]
```

- `Home` — this redesigned dashboard
- `Appointments` — existing `/portal/appointments` page (upcoming + past bookings)
- `Visit history` — **new** dedicated page at `/portal/visits` listing all finalized consultations with the existing `VisitCard`s. (Today the list lives only on the Home dashboard; this gives it a permanent URL for a judge to bookmark / share.)
- `Profile` — existing `/portal/profile` page
- The big cyan `Start pre-visit chat →` button is on the right end of the bar — primary CTA, doesn't get lost among the tabs.

## 6. New / modified components

### New components (frontend only)

| Component | Path | Purpose |
|---|---|---|
| `<NextUpCard>` (doctor) | `app/doctor/components/NextUpCard.tsx` | Doctor's next-up appointment hero |
| `<VisitsTrendChart>` | `app/doctor/components/VisitsTrendChart.tsx` | 14-day area chart, inline SVG |
| `<TodayScheduleRail>` | `app/doctor/components/TodayScheduleRail.tsx` | Vertical timeline of today's bookings |
| `<ConditionMixDonut>` | `app/doctor/components/ConditionMixDonut.tsx` | Top-5 chief complaints donut |
| `<RecentlyFinalizedStrip>` | `app/doctor/components/RecentlyFinalizedStrip.tsx` | Horizontal carousel of last 5 visits |
| `<NextAppointmentHero>` (patient) | `app/portal/components/NextAppointmentHero.tsx` | Patient's next-up appt hero with countdown |
| `<QuickActionsRow>` | `app/portal/components/QuickActionsRow.tsx` | 3-tile primary CTA row |
| `<HealthSnapshotStrip>` | `app/portal/components/HealthSnapshotStrip.tsx` | 4-tile health overview |
| `<VisitTimelineChart>` | `app/portal/components/VisitTimelineChart.tsx` | Horizontal timeline of visits + bookings |
| Patient `<VisitHistory>` page | `app/portal/visits/page.tsx` | Dedicated visit-history list page |

### Modified components

- `app/doctor/components/DoctorNav.tsx` — relabel tabs, no destination changes
- `app/components/PortalNav.tsx` (or wherever the patient nav lives) — add 3 new destinations + primary CTA button on right
- `app/doctor/page.tsx` — replace existing layout with new module stack
- `app/portal/page.tsx` — replace existing layout with new module stack

## 7. New backend surface

The redesign mostly leverages existing endpoints. Two small additions are needed:

### `GET /api/doctor/dashboard` (DOCTOR only)

Returns aggregate metrics for the doctor home page in a single round-trip (avoid 5 separate fetches on mount):

```jsonc
{
  "kpis": {
    "awaitingReview": 7,
    "bookedToday": 4,
    "finalizedThisWeek": 15,
    "avgTimeToFinalizeMinutes": 9
  },
  "visitsTrend": [
    { "date": "2026-04-18", "count": 3 },
    { "date": "2026-04-19", "count": 2 },
    /* ... 14 days, inclusive of today */
  ],
  "trendDelta": { "current": 15, "prior": 12, "deltaPct": 25 },
  "conditionMix": [
    { "label": "URTI", "count": 28, "pct": 28 },
    { "label": "Headache", "count": 12, "pct": 12 },
    /* ... up to 5; remainder bucketed as "Other" */
  ],
  "recentlyFinalized": [
    { "visitId": "...", "patientName": "Aishah B.", "chiefComplaint": "URTI", "finalizedAt": "2026-04-30T..." }
    /* ... up to 5 */
  ]
}
```

The chief-complaint heuristic lives in a `ConditionMixExtractor` helper inside `application/biz/visit/`. It scans `medical_reports.subjective` for known keywords (case-insensitive) against a fixed list. Returns "Other" if no match.

### `GET /api/patients/me/dashboard` (PATIENT only)

Single round-trip for the patient home:

```jsonc
{
  "nextAppointment": { /* AppointmentDTO or null */ },
  "stats": {
    "pastConsultations": 4,
    "activeMedications": 3,
    "allergies": 1,
    "lastVisitDate": "2026-04-26"
  },
  "timeline": [
    { "date": "2026-04-26", "kind": "FINALIZED", "summary": "Headache, mild fever" },
    { "date": "2026-05-04", "kind": "UPCOMING", "summary": "Booked" }
    /* ... last 6 months + future bookings */
  ]
}
```

Both endpoints are read-only, `@Transactional(readOnly = true)`, and reuse existing repositories.

## 8. Data flow

- Mount → call dashboard endpoint → render with skeletons → fade in modules. `staggerChildren` motion preset.
- Quick actions / nav clicks → standard `next/link` navigation, no extra fetches.
- Cancel-from-hero card → existing `cancelAppointment(id)` call, then optimistic UI update + refetch.
- Charts → pure SVG, no chart lib (keeps bundle ~0kb additional + theme-pure rendering).

## 9. Error handling

- Dashboard endpoint failure: each module independently shows a small "Couldn't load — retry" inline message; the page renders successfully even with partial data.
- Empty states for every module (no appointments, no visits, no draft queue, etc.) — designed in the layout proposal.
- Auth: existing `@PreAuthorize` guards apply; UI redirects to `/login` if 401.

## 10. Testing strategy

- **Backend:** unit tests for the `ConditionMixExtractor` heuristic (5 fixture SOAP texts → expected buckets). Integration tests for the two new dashboard endpoints — assert envelope shape + role enforcement (PATIENT can't hit doctor endpoint, etc.).
- **Frontend:** typecheck + lint must stay clean. No new unit tests — visual review is the gate.
- **E2E (Playwright MCP):** retest the two redesigned dashboards against the seeded demo data; verify aurora-glass theme parity (no white backgrounds, no purple, no Tailwind defaults like `bg-gray-X`).

## 11. Build sequence (phases)

1. **Phase 1 — Backend dashboard endpoints** (1 sub-task: add `GET /api/doctor/dashboard` + `GET /api/patients/me/dashboard` + `ConditionMixExtractor` helper + ITs).
2. **Phase 2 — Shared frontend chart primitives** (1 sub-task: `<AreaChart>` + `<DonutChart>` + `<TimelineChart>` building blocks under `app/components/charts/`, all inline-SVG, theme-tokens only).
3. **Phase 3 — Doctor portal redesign** (5 sub-tasks: each new component + page integration + nav relabel).
4. **Phase 4 — Patient portal redesign** (4 sub-tasks: each new component + new `/portal/visits` page + page integration + nav additions).
5. **Phase 5 — E2E + theme audit** (Docker `--no-cache` rebuild + Playwright screenshots of both new dashboards + side-by-side comparison with the existing aurora-glass screens).

Each phase ships independently. Phase 1 is backend-only (no UI churn). Phases 3 + 4 are independent and can run in parallel if needed.

## 12. Acceptance criteria

- Doctor dashboard: 5 modules render in the proposed order with seeded demo data; the chart shows 14 data points; the donut shows up to 5 segments; the schedule rail shows today's seeded bookings; the queue shows draft-age in human-readable form (e.g. "2h ago").
- Patient dashboard: hero card shows the booked appointment with a correct in-N-days countdown; quick actions navigate correctly; health snapshot shows non-zero counts when seeded data is present; visit timeline shows at least one finalized + one upcoming dot.
- Both nav bars match the proposed labels; clicking each tab lands on the right URL.
- No purple, no white, no Tailwind default tokens. All colors from the aurora-glass palette.
- `cd backend && ./mvnw test` passes (existing 165 + new dashboard ITs).
- `cd frontend && npm run typecheck && npm run lint` clean.
- Manual E2E via Playwright MCP verifies all flows on a fresh `docker compose down -v && docker compose build --no-cache && docker compose up -d`.

## 13. Open questions

None — design fully validated through the brainstorming session.
