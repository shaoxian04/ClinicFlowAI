# Staff & Admin Portals — Design Spec

**Date:** 2026-05-02
**Branch target:** new feature branch off `master`
**Status:** Approved (sections 1-5 confirmed via brainstorming)
**Author:** brainstorming session 2026-05-02

## 1. Background

Both `/staff/*` and `/admin/*` portals already have UI scaffolding in `frontend/app/`. Multiple pages call backend endpoints that do not exist (or use mismatched paths) and render `Stub — backend pending` banners. Several admin features expected for an MVP-grade clinic admin (disable user, force password reset, richer audit log, analytics sparkline) are missing. Staff cannot register walk-in patients or book appointments on a patient's behalf.

This spec defines the work to (1) wire all stubbed pages to working backend endpoints, (2) add the highest-value missing features for both portals, and (3) apply a layout-only redesign pass while keeping the existing aurora-glass theme intact.

The visual language is fixed: the existing aurora-glass theme (cream `#F6F1E6` base, deep maroon `#7A2E2E` primary, aurora-cyan `#22E1D7` accents, glass surfaces with backdrop blur) applies to every screen. No palette changes. Density and component shape are still in scope.

## 2. Goals & Non-goals

### Goals

- Eliminate every `Stub — backend pending` banner currently rendered in the staff and admin portals.
- Give staff a fast walk-in registration + booking flow without leaving the Today page.
- Give staff a "Book appointment" entry point on the patient detail page.
- Give admin a single drawer for per-user actions (role change, disable/reactivate, force password reset).
- Give admin a usable audit log with human-readable actor/action/resource labels and date-range filters.
- Give admin a 30-day visits sparkline alongside the four KPI cards.
- Group admin nav into top tabs + sub-tabs so the page count scales without UX cost.

### Non-goals (this round)

The following were considered and explicitly excluded from this round (deferred for later rounds):

- Staff editing patient demographics (B2)
- Manual patient registration outside walk-in (B3 covered by walk-in modal; no separate page)
- Staff resetting a patient's password (B4)
- Print-queue ticket / call-next display (D1)
- NRIC search field (D2)
- View user's recent activity drilldown from drawer (E4)
- Doctor MMC#/specialty editor in drawer (E5; existing `/admin/users/new` form keeps these on creation)
- Audit CSV export (F2)
- "Suspicious activity" preset filters (F3)
- Doctor-breakdown analytics (G3)
- DDI / safety findings dashboard (G4)
- Clinic profile settings page (H2)
- Notification settings page (H3)
- Holiday calendar (H4)
- PDPA data-subject export (I1)
- Audit retention policy notice (I2)

### Out of scope per PRD §7

E-prescribing/pharmacy integration, billing/payment, telemedicine/video, full EHR replacement, native mobile apps, vector DB / RAG. Do not propose these regardless of perceived value.

## 3. Decisions captured during brainstorming

The following design questions were resolved before writing this spec. They are listed here so future readers can see the trade-offs without re-deriving them.

| # | Question | Decision |
|---|---|---|
| 1 | Visual theme | Keep aurora-glass exactly as-is; no palette work in this round |
| 2 | Nav shape | Top tabs + sub-tabs grouping where >1 child |
| 3 | Staff Today row layout | Two-line row; all actions visible without expanding |
| 4 | Walk-in flow shape | Modal launched from Today (not separate page or wizard) |
| 5 | Book for existing patient | Separate slimmer modal launched from patient detail (not unified with walk-in) |
| 6 | Per-user admin actions | Right-side detail drawer (not added columns or inline buttons) |
| 7 | Audit log columns/filters | Richer columns with resource labels; quick-range presets + custom range |
| 8 | Analytics scope | Wire 4 existing KPIs + add 30-day sparkline (hand-rolled SVG) |
| 9 | Authorization | Staff can register PATIENT-role users (walk-in only) and read patient demographics; admin retains creation of STAFF/DOCTOR/ADMIN, role change, disable, force-reset |

## 4. Feature inventory

### 4.1 Backend wiring (W)

| ID | Feature |
|---|---|
| W1 | `GET /api/staff/today` — appointments list with check-in state and pre-visit status |
| W2 | `POST /api/staff/checkin` — flip appointment to `CHECKED_IN` |
| W3 | Fix frontend → backend path mismatch for patient search and patient detail |
| W4 | `PATCH /api/admin/users/{id}/role` — change role + audit |
| W5 | `GET /api/admin/audit` — paginated, filterable, with resource labels |
| W6 | `GET /api/admin/analytics` — 4 KPIs + 30-day daily-visits series |

### 4.2 New features

| ID | Feature |
|---|---|
| A3 | Walk-in modal on staff Today (find-or-register patient → slot → type → book) |
| C1 | "Book appointment" button on patient detail (slimmer modal, patient pre-bound) |
| E1 | Admin: change user role (drawer action) |
| E2 | Admin: disable / reactivate user (drawer action) |
| E3 | Admin: force password reset on next login (drawer action) |

### 4.3 Redesigns (R)

All redesigns preserve the aurora-glass theme. They change only layout, density, and component shape.

| ID | Redesign |
|---|---|
| R1 | Staff Today: two-line rows + "+ Walk-in" button |
| R2 | Admin Users: table + right-side detail drawer |
| R3 | Admin Audit: richer table + better filters |
| R4 | Admin Analytics: KPIs + sparkline |
| R5 | Admin nav: top tabs + sub-tabs (Overview · Users · Schedule · Reports · Audit) |
| R6 | Staff nav: flat tabs (Today · Patients · Schedule) |

## 5. Backend API surface

All new endpoints follow Spring Boot conventions already established in this codebase: controller class under `controller/biz/<context>/`, returns `WebResult<T>` envelope, identity derived from `JwtService.Claims claims` on the principal, RBAC via `@PreAuthorize` at class or method level, audit row inserted within the same transaction as the mutation.

### 5.1 Endpoint table

**Audit convention (existing, must follow):** `audit_log.action` has a CHECK constraint allowing only `READ / CREATE / UPDATE / DELETE / LOGIN / EXPORT`. The "what specifically changed" goes into `resource_type` (e.g., `USER_PASSWORD`) and/or the `metadata` JSONB column (e.g., `{field: "role", from: "DOCTOR", to: "ADMIN"}`). The existing `AuditWriter.append(action, resourceType, resourceId, actorUserId, actorRole)` signature is used unchanged for new endpoints — except the analytics/audit/role-change tasks add a 6th-arg `metadata` overload (see plan).

| Method | Path | Auth | Purpose | Audit (action / resource_type) |
|---|---|---|---|---|
| GET | `/api/staff/today` | `STAFF` | Today's appointments + check-in state + pre-visit status | (read, none) |
| POST | `/api/staff/checkin` | `STAFF` | Body: `{appointmentId}` → `CHECKED_IN` | `UPDATE` / `APPOINTMENT` (metadata: `{checked_in: true}`) |
| POST | `/api/staff/patients` | `STAFF` | Walk-in registration; creates `PATIENT` user; returns `{patientId, userId, tempPassword}` | `CREATE` / `USER` and `CREATE` / `PATIENT` |
| GET | `/api/patients/search?q=` | `STAFF` or `DOCTOR` | (already exists; frontend path fix only) | (read, none) |
| GET | `/api/patients/{id}` | `STAFF` or `DOCTOR` | Demographics + last 5 visits preview | (read, none) |
| PATCH | `/api/admin/users/{id}/role` | `ADMIN` | Body: `{role}` → updates `users.role`. Reject self-demotion | `UPDATE` / `USER_ROLE` (metadata: `{from, to}`) |
| PATCH | `/api/admin/users/{id}/active` | `ADMIN` | Body: `{active: bool}` → flips existing `users.is_active`. Reject self-deactivate | `UPDATE` / `USER` (metadata: `{is_active: bool}`) |
| POST | `/api/admin/users/{id}/force-password-reset` | `ADMIN` | Sets `must_change_password=true`, rotates password, returns `tempPassword` once | `UPDATE` / `USER_PASSWORD` (metadata: `{force_reset: true}`) |
| GET | `/api/admin/audit` | `ADMIN` | Paginated, filterable; returns enriched rows with actor + resource label | (read, none) |
| GET | `/api/admin/analytics` | `ADMIN` | 4 KPIs + `dailyVisits30d: [{date, count}]` zero-filled to 30 entries | (read, none) |

### 5.2 Authorization rules (explicit)

- All `/api/staff/*` endpoints: `@PreAuthorize("hasRole('STAFF')")` at class level.
- All `/api/admin/*` endpoints: `@PreAuthorize("hasRole('ADMIN')")` at class level.
- `POST /api/staff/patients` always assigns `role=PATIENT` server-side. Role is never read from the request body — staff cannot escalate.
- Self-action guards (admin acting on own user): admin cannot demote, disable, or trigger force-reset on themselves. Returns `409 SELF_ACTION_FORBIDDEN`.
- `PATCH /api/admin/users/{id}/role`: both the target user's current role and the new role in the request body must be in `{STAFF, DOCTOR, ADMIN}`. Patient role transitions in or out are out of scope and return `409 INVALID_TARGET_ROLE`.

### 5.3 Schema changes

- **No new column needed for disable/reactivate.** `users.is_active boolean NOT NULL DEFAULT true` already exists from V1. Disable = `is_active = false`. Login filter and JWT issuance already check this column.
- **No new column needed for force-reset.** `users.must_change_password boolean NOT NULL DEFAULT false` already exists from V9. Setting to `true` is sufficient to gate the next login.
- **No `audit_log` schema change.** Existing CHECK constraint (`action IN READ/CREATE/UPDATE/DELETE/LOGIN/EXPORT`) and append-only triggers stay untouched. New events use the existing six action verbs; the discriminator goes into `resource_type` (e.g., `USER_PASSWORD`, `USER_ROLE`) and `metadata` JSONB.
- **AuditWriter overload.** Add an `AuditWriter.append(action, resourceType, resourceId, actorUserId, actorRole, metadata)` overload that writes the `metadata jsonb` column. The existing 5-arg `append` continues to work and writes empty `{}` metadata.
- **Audit indexes.** V1 already has `audit_log_resource_idx (resource_type, resource_id)` and `audit_log_actor_time_idx (actor_user_id, occurred_at DESC)`. New migration `V12__audit_action_index.sql` adds `idx_audit_log_action_time (action, occurred_at DESC)` to keep the audit list page snappy under date+action filters. Apply manually in Supabase SQL editor.

### 5.4 Error codes (all returned via `WebResult.error`)

| Code | When | HTTP |
|---|---|---|
| `APPOINTMENT_ALREADY_CHECKED_IN` | Idempotent re-check-in is treated as 200 with no state change. Only invalid-state check-ins return this. | 409 |
| `INVALID_STATE` | Check-in on a CANCELLED / NO_SHOW / COMPLETED appointment | 409 |
| `SLOT_TAKEN` | Race during walk-in / book-for-patient | 409 |
| `SELF_ACTION_FORBIDDEN` | Admin acts on own user via role-change, disable, or force-reset | 409 |
| `INVALID_TARGET_ROLE` | Role-change attempted on a `PATIENT` row | 409 |
| `USER_NOT_FOUND` / `APPOINTMENT_NOT_FOUND` / `PATIENT_NOT_FOUND` | Self-explanatory | 404 |

Frontend reads `error.code` for branching, never matches strings against `error.message`.

## 6. Frontend structure

### 6.1 File layout

```
frontend/app/staff/
  layout.tsx                     [new]  shared StaffShell + auth guard
  page.tsx                       [edit] Today (R1: two-line rows + "+ Walk-in" button)
  patients/page.tsx              [edit] fix path: /patients?q= → /api/patients/search?q=
  patients/[id]/page.tsx         [edit] fix path; add "Book appointment" button
  schedule/page.tsx              [unchanged]
  components/
    StaffNav.tsx                 [edit] flat tabs
    WalkInModal.tsx              [new]  A3 walk-in flow
    BookForPatientModal.tsx      [new]  C1 patient-bound booking
    SlotPicker.tsx               [new]  shared slot grid (today + future days)
    AppointmentRow.tsx           [new]  two-line row used by Today + day-schedule

frontend/app/admin/
  layout.tsx                     [new]  shared AdminShell + auth guard
  page.tsx                       [edit] Overview tile grid
  users/page.tsx                 [edit] table + drawer launcher
  users/new/page.tsx             [unchanged] STAFF/DOCTOR/ADMIN creation; linked from Users header
  audit/page.tsx                 [edit] richer table + filters
  analytics/page.tsx             [edit] KPIs + sparkline
  schedule-template/page.tsx     [unchanged]
  components/
    AdminNav.tsx                 [edit] top tabs + sub-tabs grouping
    UserDetailDrawer.tsx         [new]  E1/E2/E3 actions
    AuditRow.tsx                 [new]  expandable row with detailJson
    AuditFilters.tsx             [new]  extracted filter form
    KpiSparkline.tsx             [new]  hand-rolled SVG sparkline
```

### 6.2 Shared lib changes

```
frontend/lib/
  staff.ts        [new]  getTodayList, checkIn, registerWalkInPatient
  admin.ts        [new]  listUsers, changeUserRole, setUserDisabled, forcePasswordReset, listAudit, getAnalytics
  appointments.ts [edit] add bookAppointmentForPatient(patientId, slotId, type, previousVisitId?)
```

`api.ts` and `auth.ts` are reused as-is.

### 6.3 Component patterns

- **Auth guard in layout.** The per-page `useEffect(() => { getUser(); router.replace })` pattern is duplicated in 8+ pages. Pull into `staff/layout.tsx` and `admin/layout.tsx`. Pages no longer re-implement it.
- **Stub banner removed once endpoint is wired.** Pages currently render `Stub — backend pending` on 404. After wiring in this round, that branch is removed (no `is404 ? stubHint : error` toggles in new code).
- **Skeleton loaders.** Reuse existing `<SkeletonRows count>` pattern with `.skeleton-bar` classes already in `globals.css`.
- **Empty state.** Reuse `<EmptyState title body>` pattern from `staff/patients/page.tsx`.

### 6.4 Modal pattern (shared primitive for `WalkInModal` and `BookForPatientModal`)

- Backdrop: blurred overlay using existing `--surface` tokens.
- Card: cream background with maroon header strip.
- Behavior: focus trap on open; `Esc` closes; click-outside closes (with confirm if form is dirty).
- Errors: inline `banner banner-error`.
- Success: closes modal, calls parent's refresh callback.

### 6.5 New flow — Walk-in modal (A3, on Today)

1. Staff clicks `+ Walk-in` on Today page → modal opens.
2. Top of modal: search field (debounced `/api/patients/search`) for existing patient.
3. If a match is selected → step 5.
4. Otherwise → click "Register new patient" → form expands inline (full name, DOB, phone, email?).
5. `SlotPicker` loads today's `AVAILABLE` slots from `/api/schedule/days/{today}`.
6. Pick slot + type (NEW_SYMPTOM / FOLLOW_UP).
7. Submit:
   - If new patient → `POST /api/staff/patients` → returns `{patientId, tempPassword}`.
   - `POST /api/appointments {patientId, slotId, type}`.
   - On `409 SLOT_TAKEN` → reload slots, show banner "Slot was just taken — pick another".
8. After-success state shows a one-time "Print credentials" panel with the tempPassword if a new patient was created.
9. Modal closes; Today list refreshes.

### 6.6 New flow — Book-for-patient modal (C1, on patient detail)

Same modal primitive as walk-in. Patient is fixed (no search step rendered). Steps 5-9 only.

### 6.7 New flow — User detail drawer (E1/E2/E3, on admin Users)

- Right-side drawer, ~420px wide, full height.
- Sections:
  - **Identity** — read-only: email, full name, role chip, status chip (Active / Disabled), last-login if available.
  - **Role change** — select + Save button. Disabled with tooltip "Cannot perform this on your own account" when target.id === currentUser.id.
  - **Status** — Disable / Reactivate button (label flips with state). Self-action guard same as above.
  - **Password** — "Force password reset on next login" button. On success, displays the temp password once with a Copy button.
- Each action shows inline confirmation; success shows banner inside the drawer; data refreshes inline; drawer stays open.

### 6.8 Navigation structure

**Staff nav (R6) — flat:**
- Today · Patients · Schedule

**Admin nav (R5) — top + sub:**
- Overview (no sub)
- Users → All users · New user
- Schedule → Day view · Schedule template
- Reports → Analytics
- Audit (no sub)

Sub-tabs only render when there are >1 children. Future deferred features (clinic profile, holiday calendar, safety-findings dashboard) have obvious slots in this structure.

## 7. Data flow & error handling

### 7.1 A3 Walk-in registration + booking sequence

```
Staff (browser)              Spring Boot                              Postgres
├─ POST /api/staff/patients ─► UserWriteAppService.createPatientUser
│   {name, dob, phone, email?} ├─ generate temp password
│                              ├─ insert users (role=PATIENT, must_change_password=true)
│                              ├─ insert patients (linked to userId)
│                              └─ insert audit_log (USER.CREATE, PATIENT.CREATE)  ──► append
│   ◄─ {patientId, userId, tempPassword}
│
├─ POST /api/appointments  ───► AppointmentWriteAppService.book
│   {patientId, slotId, type}  ├─ select slot FOR UPDATE
│                              ├─ if slot.status != AVAILABLE → 409 SLOT_TAKEN
│                              ├─ update slot.status=BOOKED; insert appointments
│                              └─ insert audit_log (APPOINTMENT.CREATE)            ──► append
│   ◄─ {appointmentId}
│
└─ refresh Today list (GET /api/staff/today)
```

### 7.2 W1 + W2 Today + check-in

```
GET /api/staff/today
  → join appointments (today, status IN (BOOKED, CHECKED_IN)) ⨯ patients ⨯ users(doctor)
  → for each appt, look up pre_visit_sessions latest status (none / pending / submitted)
  → return list sorted by slot.startAt

POST /api/staff/checkin {appointmentId}
  → if appt.status = BOOKED        → set CHECKED_IN
                                    audit: action=UPDATE, resource_type=APPOINTMENT,
                                           resource_id=appt.id, metadata={checked_in: true}
  → if appt.status = CHECKED_IN    → 200 idempotent (no audit row, no state change)
  → if appt.status = CANCELLED|NO_SHOW|COMPLETED → 409 INVALID_STATE
```

### 7.3 E1/E2/E3 Admin user actions

```
PATCH /api/admin/users/{id}/role  {role}
  → guard: actor.id != id                                  (else 409 SELF_ACTION_FORBIDDEN)
  → guard: target.role IN (STAFF, DOCTOR, ADMIN)           (else 409 INVALID_TARGET_ROLE)
  → guard: requested role IN (STAFF, DOCTOR, ADMIN)        (else 409 INVALID_TARGET_ROLE)
  → update users.role
  → audit: action=UPDATE, resource_type=USER_ROLE, resource_id=user.id, metadata={from, to}

PATCH /api/admin/users/{id}/active  {active: bool}
  → guard: actor.id != id
  → update users.is_active
  → audit: action=UPDATE, resource_type=USER, resource_id=user.id, metadata={is_active: <bool>}

POST /api/admin/users/{id}/force-password-reset
  → guard: actor.id != id
  → set must_change_password=true; rotate password to fresh temp string; return tempPassword once
  → audit: action=UPDATE, resource_type=USER_PASSWORD, resource_id=user.id, metadata={force_reset: true}
    (metadata must NOT contain the plaintext temp password)
```

### 7.4 W5 Audit list with enriched labels

```
GET /api/admin/audit?page&size&user&action&resourceType&dateFrom&dateTo&range
  → query audit_log with filters (range overrides dateFrom/dateTo if both provided)
  → batch-fetch users by actor_id (one IN query)
  → batch-fetch resource labels grouped by resource_type:
      PATIENT        → patients.full_name
      VISIT          → "{date} — {doctor_name}" (visits ⨯ users)
      USER           → users.email
      APPOINTMENT    → "{date_time} — {patient_name}" (appointments ⨯ patients)
      MEDICAL_REPORT → visit label
      (other)        → null → frontend renders truncated UUID
  → assemble enriched rows; never mutate audit_log
```

### 7.5 W6 Analytics

```
GET /api/admin/analytics
  → visitsThisWeek    = count(medical_reports WHERE finalized_at >= start_of_week)
  → avgReviewTimeMin  = avg(reviewed_at - draft_at) over finalized reports last 30d, in minutes
  → aiAcceptanceRate  = % of reports finalized without doctor SOAP body edits last 30d
  → patientsThisMonth = count(distinct patient_id) from appointments first-this-month
  → dailyVisits30d    = SELECT date_trunc('day', finalized_at) AS d, count(*)
                        FROM medical_reports
                        WHERE finalized_at >= now() - interval '30 days'
                        GROUP BY d ORDER BY d
                        (zero-fill missing days in app layer to exactly 30 entries)
```

### 7.6 Frontend error handling

| Scenario | UI behavior |
|---|---|
| Stub endpoint returns 404 (during transition only — gone after wiring) | `ghost-banner` + empty list |
| Network / 5xx | `banner banner-error` with the error message; row-level errors stay scoped |
| 401 / 403 on auth-guarded page | `router.replace("/login")` |
| 409 SELF_ACTION_FORBIDDEN | inline error inside drawer; controls disabled with tooltip |
| 409 SLOT_TAKEN during walk-in / book-for-patient | reload slots + banner "Slot was just taken — pick another" |
| 409 APPOINTMENT_ALREADY_CHECKED_IN | toast/banner: idempotent success — leave row in checked-in state |
| 409 INVALID_TARGET_ROLE | inline error: "Role change for this user is not supported" |

## 8. PDPA / identity invariants (must be honored)

- **Server-side identity.** Every controller derives `actorId` from `JwtService.Claims claims`. Path params are validated against actor identity for self-action guards.
- **Audit triggers untouched.** `audit_log` UPDATE/DELETE remain rejected by DB triggers. Application code only INSERTs.
- **No audit-leak.** The `metadata` JSONB for the force-reset event records `{force_reset: true}` only — never the plaintext temp password.
- **Frontend talks to Spring Boot only.** No direct calls from Next.js to the Python agent or Neo4j; no Supabase JS client for clinical data.
- **Walk-in role assignment is server-side.** `POST /api/staff/patients` always assigns `role=PATIENT`. Body cannot escalate.

## 9. Testing strategy

### 9.1 Backend unit tests (JUnit + Mockito)

- `UserWriteAppService.createPatientUser` — generates valid temp password, sets `must_change_password=true`, writes both audit rows.
- `AdminUserAppService.changeRole` — rejects self-demotion (409); writes audit detail `{from, to}`.
- `AdminUserAppService.setActive` — rejects self-deactivate; flips `users.is_active`; emits audit row with `metadata.is_active = <bool>`.
- `AdminUserAppService.forcePasswordReset` — rotates password, sets must-change flag, audit row contains no plaintext password.
- `AuditReadAppService.list` — filter combinations (user × action × resourceType × dateRange); resource-label batch-loader returns correct labels per type and falls back to truncated UUID.
- `AnalyticsReadAppService.compute` — KPI math on a deterministic fixture; sparkline zero-fills missing days; week boundary respects clinic timezone.
- `StaffTodayService.list` — joins return correct pre-visit status (none/pending/submitted) per appointment.
- `StaffCheckinService.checkIn` — idempotent on already-checked-in; rejects on cancelled/no-show.

### 9.2 Backend integration tests (`@SpringBootTest` with Testcontainers Postgres)

- `POST /api/staff/patients` — 201 with payload; both audit rows written; user row has `role=PATIENT` regardless of any role injected in the request body.
- `POST /api/staff/checkin` twice — first 200 + audit; second 200 + no new audit row.
- `PATCH /api/admin/users/{id}/role` self-demotion → 409 + zero state change + zero audit rows.
- `GET /api/admin/audit?range=7d&resourceType=USER` returns only user-related rows in window; pagination correct; resource labels populated.
- `GET /api/admin/analytics` against seeded data returns expected numbers and a 30-element `dailyVisits30d` array (zero-filled).
- RBAC: `STAFF` JWT calling `/api/admin/users` returns 403; `PATIENT` JWT calling `/api/staff/today` returns 403.

### 9.3 Frontend unit tests

- `WalkInModal` — search → no match → register form expands; submit calls `staff.registerWalkIn` then `bookAppointment`; on `409 SLOT_TAKEN`, banner appears and slots reload.
- `BookForPatientModal` — patient is pre-bound; no search step rendered.
- `UserDetailDrawer` — self-action controls disabled with tooltip when `currentUser.id === target.id`.
- `KpiSparkline` — renders 30 bars from a 30-element series; handles all-zero data; renders an axis baseline.
- `AuditRow` — clicking expand reveals `detailJson` formatted; clicking again collapses.

### 9.4 E2E tests (Playwright, per project E2E protocol)

Each phase rebuilds Docker `--no-cache` and uses Playwright MCP. Critical journeys:

- **Staff walk-in:** login as staff → Today → "+ Walk-in" → search "nonexistent" → "Register new" → fill form → pick slot → NEW_SYMPTOM → Book → see new row in Today list.
- **Staff check-in:** click Check-in on a booked row → row updates to "Checked in".
- **Patients path fix:** login as staff → Patients → search → results render (no "Data unavailable" banner); click row → patient detail loads.
- **Admin user lifecycle:** login as admin → Users → click row → drawer opens → change role to STAFF → Save → drawer reflects → Audit page shows an `UPDATE` / `USER_ROLE` row with `metadata.from`/`metadata.to`.
- **Admin deactivate + reactivate:** deactivate a doctor → drawer shows "Inactive" chip → audit shows `UPDATE` / `USER` `{is_active: false}` → reactivate → audit shows `{is_active: true}`.
- **Admin force-reset:** trigger reset → audit shows `UPDATE` / `USER_PASSWORD` `{force_reset: true}`; logging in as that user lands on forced-password-change page.
- **Admin self-action guard:** admin opens own row → controls disabled with tooltip; attempting via curl returns 409.
- **Admin analytics:** loads with non-zero KPIs and a 30-bar sparkline against seeded fixture.
- **Admin audit:** filters work (user, action, range presets); expand row shows detail; resource label resolves for known types.

### 9.5 Visual review

After each phase, capture a screenshot of every redesigned page and validate against the existing aurora-glass theme. No palette deviation; surfaces use existing tokens; tables don't fight the cream background.

## 10. Phased rollout

Each phase is independently shippable. Phase gating: backend tests green; frontend `lint` + `typecheck` clean; E2E pass on a fresh `--no-cache` rebuild; no palette deviation in visual review.

### Phase 1 — Wiring foundations

**Backend:** `/api/staff/today`, `/api/staff/checkin`, `/api/admin/users/{id}/role`, fix patient-search path.
**Frontend:** stub-banners removed; no UI changes beyond wiring up real data.
**Migrations:** none.

### Phase 2 — Admin user actions + drawer

**Backend:** active-flip + force-reset endpoints. No new column needed (`users.is_active` and `users.must_change_password` both already exist).
**Frontend:** `UserDetailDrawer` + R2 redesign of Users page.

### Phase 3 — Audit + analytics

**Backend:** `/api/admin/audit` with enriched labels; `/api/admin/analytics` with sparkline series; `V12__audit_action_index.sql` (new index `idx_audit_log_action_time` for filter performance).
**Frontend:** R3 audit redesign, R4 analytics redesign with `KpiSparkline`.

### Phase 4 — Walk-in + book-for-patient

**Backend:** `/api/staff/patients`.
**Frontend:** `WalkInModal`, `BookForPatientModal`, `SlotPicker`.

### Phase 5 — Nav + shell polish

**Frontend:** admin nav R5, staff nav R6, `staff/layout.tsx` and `admin/layout.tsx` consolidated auth guards. Touches every page lightly — done last to avoid merge churn during phases 1-4.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wrong assumption that disable needs a new column | Verified: `users.is_active` already exists from V1 — no migration. Login filter already gates on it |
| Walk-in race: two staff book the same slot simultaneously | Already handled by `AppointmentWriteAppService` `SELECT … FOR UPDATE`; surface 409 SLOT_TAKEN cleanly in modal |
| JWT-stateless deactivate means deactivated users can act until token expires | Verify `JwtAuthenticationFilter` rejects requests when `users.is_active=false` per-request (most filters re-load the principal); if not, document as a known limitation. Out of this round |
| Resource-label batch loader N+1 if implemented naively | Plan calls out: group by `resource_type`, one IN query per type |
| Audit page heavy under load (large `audit_log`) | Verify indexes on `(timestamp DESC)`, `(actor_id)`, `(action)`, `(resource_type)`; add via migration if missing |
| Force-reset flow could leak the temp password into audit detail if implemented carelessly | Spec calls out explicitly: `detailJson` records the fact of reset only |
| Stub banners visible in production until each phase ships | Each phase removes its own stub branches; Phase 1 covers the most-visible ones (Today + Audit + Analytics) first |

## 12. Open questions

None at spec time — all design questions were resolved before writing this file.

If new questions surface during plan-writing or implementation, raise them in the plan document or as PR comments before resolving.

## 13. Acceptance criteria summary

- Every page in `/staff/*` and `/admin/*` reads its data from a real backend endpoint. No `Stub — backend pending` banner appears anywhere.
- Staff can register a walk-in patient and book today's appointment in a single modal interaction without leaving Today.
- Staff can book an appointment for an existing patient from the patient detail page.
- Admin can change a user's role, disable/reactivate, and force a password reset, all from a single right-side drawer.
- Admin Users table has no inline action buttons or kebab menus; all per-user actions live in the drawer.
- Admin Audit log displays human-readable actor name + role chip, action label + raw code, and a resolved resource label for top resource types. Quick-range presets (24h / 7d / 30d) work alongside custom date range.
- Admin Analytics shows the 4 KPIs and a hand-rolled 30-day visits sparkline; no charting dependency added to `package.json`.
- Admin nav uses top tabs + sub-tabs structure; staff nav remains flat.
- All visual surfaces match the existing aurora-glass theme exactly. No palette additions to `globals.css`.
- Self-action guards return 409 SELF_ACTION_FORBIDDEN; UI disables those controls with a tooltip.
- Every new write endpoint inserts an `audit_log` row in the same transaction; force-reset detail does not contain plaintext passwords.
