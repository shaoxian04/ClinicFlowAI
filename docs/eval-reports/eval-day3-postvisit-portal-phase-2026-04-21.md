---
feature: day3-postvisit-portal
date: 2026-04-21
iteration: 001
verdict: BLOCK
score: 5.85
evaluator: evaluator-agent
---

# CliniFlow AI — Full Stack E2E Evaluation Report

## API Smoke Test

| Endpoint | Status | Observation |
|----------|--------|-------------|
| POST /api/auth/login (patient) | 200 | code=0, token present, role=PATIENT, fullName="Pat Demo" |
| POST /api/auth/login (doctor) | 200 | code=0, token present, role=DOCTOR, fullName="Dr. Demo" |
| GET /api/patient/visits | 200 | Returns 1 visit with real data, envelope-wrapped correctly |
| GET /api/patient/visits/{id} | 200 (curl) / broken (browser) | Real Spring Boot response correct; browser receives mock un-enveloped data |
| GET /api/visits (doctor) | 200 | Returns 8 visits with real backend data |
| GET /api/doctor/visits | 500 | Endpoint does not exist — "No static resource api/doctor/visits" |
| GET /api/staff/today (patient token) | 500 | Endpoint does not exist — returns 500 not 403 |
| POST /api/patient/consent | 500 | Endpoint does not exist — "No static resource api/patient/consent" |

## Browser Flow Results

### Flow 1: Landing → Login → Patient Portal
- PASS: Landing page loads at localhost:80
- PASS: "Sign in to continue" navigates to /login
- PASS: Login form visible with correct split-panel design
- PASS: Credentials accepted, redirected to /consent
- PARTIAL: Consent form UI correct (disabled button, 3 checkboxes), but consent API call fails (see issues)
- FAIL: Cannot reach /portal via normal flow — consent POST returns 500 due to double /api/ prefix

### Flow 2: Patient portal navigation
- PASS (with manual consent injection): Portal loads with real data — 1 visit, 2 meds, date shown
- PASS: Visit card renders with preview text, "finalized" pill, doctor avatar "D", "Tap to read full summary →"
- FAIL: Clicking visit navigates to /portal/visits/[id] which renders "code undefined" error banner
- FAIL: EN/MS toggle cannot be tested — page crashes before reaching toggle UI

### Flow 3: Login as Doctor
- PASS: Login as doctor@demo.local → redirected to /doctor
- PASS: Doctor dashboard renders with real data: "AWAITING YOUR REVIEW 1", "SCHEDULED TODAY 6", "SIGNED & FILED 1"
- PASS: "AI draft" pill shows on awaiting visit (not raw enum AWAITING_DOCTOR_REVIEW)
- PASS: Phase dots (PRE/VISIT/POST) visible per row
- PASS: Doctor visit detail loads: PhaseTabs, ProgressRail, FinalizeBar, real pre-visit data
- FAIL: DoctorNav "Queue" and "Finalized" tabs → 404 (pages not built)
- PARTIAL: Doctor visit row click unresponsive in Playwright (works on direct navigation)

### Flow 4: PDPA consent flow
- PASS: Consent page renders correctly with 3 checkboxes + disabled button
- PASS: "I agree →" button disabled when checkboxes unchecked
- PASS: Button enables after all 3 checkboxes checked
- FAIL: "I agree →" click triggers POST to /api/api/patient/consent (double prefix bug)
- FAIL: 500 error returned, consent never recorded, stuck on consent page

### Flow 5: Pre-visit intake
- PASS: /previsit/new renders intake chat UI
- PASS: "You → AI → Dr" flow partners strip visible
- PASS: Step progress dots (Symptoms/Duration/History/Allergies/Ready) visible
- PASS: Initial assistant message displayed
- NOTE: Accessible to doctor-logged-in user (should be patient-only, RBAC gap)

### Flow 6: Admin/Staff RBAC
- PASS: /staff (unauthenticated) → redirects to /login
- PASS: /admin (unauthenticated) → redirects to /login

## Design Assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Visual coherence | 5/5 | All pages share consistent warm parchment palette, Cormorant serif headings, teal/terracotta accents |
| Color application | 5/5 | Teal CTAs, terracotta primary actions, muted pill backgrounds — consistent throughout |
| Typography hierarchy | 4/5 | Clear H1/H2/body separation; eyebrow labels excellent; sub-label spacing slightly tight on mobile |
| Spacing/rhythm | 4/5 | Good vertical rhythm; hero has large empty space at 1440px between copy and emblem |
| Mobile at 375px | 4/5 | No overflow, stacks correctly; stat cards stack to single column (could be 2-col grid); landing hero truncates above fold |
| Loading/empty states | 4/5 | Skeleton components exist; visit detail error state shows "code undefined" (unhelpful); patient context "HTTP 500" graceful |
| Trust signals | 5/5 | "PDPA compliance" branding, doctor seal, doctor attribution line, finalized pill — all present |
| Accessibility | 3/5 | `role="tablist"` on lang toggle is correct; phase dots have `aria-label`; consent checkboxes have no `id`/`for` pair; focus rings not verified |

**Overall Design: 4.25/5 → 8.5/10**

## Backend Logic

- Doctor attribution: visit detail API returns `doctorName: "Dr. Demo"` — attribution implemented. Page crashes before rendering it.
- Medication data: API returns `[{name:"Paracetamol",dosage:"500mg",frequency:"TDS"},{name:"Dextromethorphan syrup",dosage:"10mL",frequency:"BD"}]` — round-trip correct.
- Status pill: Doctor dashboard shows "AI draft" (not raw "IN_PROGRESS" enum) — correct.
- Missing: `/api/doctor/visits`, `/api/staff/today`, `/api/patient/consent` endpoints are all unimplemented in Spring Boot.

## Issues Found

### CRITICAL

**C1: Patient visit detail page broken — "code undefined" crash**
- `/portal/visits/[visitId]` consistently renders error banner "code undefined"
- Root cause: browser fetch to `/api/patient/visits/{id}` returns un-enveloped raw JSON (`{visitId,summaryEn,...}`) instead of standard `{code:0,data:{...}}` envelope. `apiGet` reads `envelope.code` which is `undefined` → error message `"code ${undefined}"`.
- Impact: The entire post-visit patient portal core feature (reading your summary) is broken. This is the primary deliverable of the sprint.
- How to fix: Investigate why `/api/patient/visits/{id}` returns un-wrapped JSON from the browser context. Likely cause is the Next.js rewrite (`/api/:path*` → `localhost:8080/api/:path*`) intercepting the browser fetch before Nginx can proxy it, and Next.js is responding with a cached/mock response. Fix: set `BACKEND_URL=http://backend:8080` in the frontend service's docker-compose environment, so the Next.js rewrite correctly proxies server-side. Additionally add `BACKEND_URL: http://backend:8080` to `docker-compose.yml` under `frontend.environment`.

**C2: Consent flow broken — double `/api/` prefix**
- Consent page calls `apiPost("/api/patient/consent", ...)` but `lib/api.ts` prepends `BASE="/api"` giving URL `/api/api/patient/consent`.
- Impact: Patient is permanently stuck on /consent page after login; cannot access portal through normal flow.
- How to fix: Change consent page line 31 from `apiPost("/api/patient/consent", ...)` to `apiPost("/patient/consent", ...)`. All other `apiPost`/`apiGet` calls in the codebase use paths without the `/api/` prefix (e.g., `/patient/visits`) — this is the only outlier.

**C3: Consent API endpoint not implemented in Spring Boot**
- POST `/api/patient/consent` returns 500 "No static resource api/patient/consent"
- Even after fixing C2, the request will hit the backend which has no handler for this endpoint.
- Impact: Consent cannot be persisted to database; PDPA audit trail for consent is missing.
- How to fix: Implement `POST /api/patient/consent` in Spring Boot — create `ConsentController` under `my.cliniflow.controller.biz.patient`, accepting a `{timestamp}` payload, recording consent in `users` table or a new `consent_log` table, returning `{code:0,data:true}`.

### HIGH

**H1: `/api/doctor/visits` and `/api/staff/today` not implemented**
- Both endpoints return 500 ("No static resource") with any auth token.
- Doctor frontend uses `/api/visits` (which works), so the doctor dashboard functions. But `GET /api/staff/today` is completely absent.
- How to fix: Implement staff endpoint or confirm doctor dashboard does not require `/api/doctor/visits` (currently it uses `/api/visits`). Verify staff endpoint scope and implement.

**H2: DoctorNav "Queue" and "Finalized" tabs link to non-existent pages**
- `/doctor/queue` and `/doctor/finalized` return 404
- Console shows 2 errors on doctor dashboard load from prefetch of these pages
- How to fix: Either create `/doctor/queue/page.tsx` and `/doctor/finalized/page.tsx` with appropriate content, or disable/grey-out these tabs with `disabled` prop until implemented. The DoctorNav already supports a `disabled` prop type.

**H3: Missing `BACKEND_URL` in docker-compose causes Next.js rewrites to fail**
- `next.config.js` rewrites `/api/:path*` to `process.env.BACKEND_URL ?? "http://localhost:8080"` 
- In Docker, `localhost:8080` inside the frontend container is unreachable (connection refused)
- This means all server-side API calls from Next.js (SSR, ISR) fail silently
- How to fix: Add `BACKEND_URL: http://backend:8080` to `frontend.environment` in `docker-compose.yml`

### MEDIUM

**M1: Previsit intake accessible by doctor role**
- `/previsit/new` shows for doctor-logged-in user without redirecting; page says "← Back to portal"
- Should redirect doctor to `/doctor` since previsit is a patient-only flow

**M2: Portal greeting uses email prefix not fullName**
- "Welcome back, Patient." uses `email.split("@")[0]` ("patient") instead of `user.fullName` ("Pat Demo")
- `fullName` is available in `AuthUser` type and returned in login response

**M3: Consent page catches 500 errors as "authoritative rejection" and shows error**
- Lines 42-47: if error is not HTTP 404 and not a network failure, it shows "Consent could not be recorded"
- A backend 500 is treated as rejection, preventing graceful fallback
- Should treat 500 like 404 (proceed optimistically) OR show a more helpful message

**M4: Visit detail React hydration errors (error #418, #423)**
- 6+ React hydration mismatch errors in console on visit detail load
- Likely caused by server-rendering different content than client render due to localStorage access
- Consider wrapping localStorage reads in `useEffect` only, never in render phase

### LOW

**L1: Landing page hero has excessive empty space at 1440px**
- Hero content is left-aligned with emblem far right; large white gap in between at wide viewports
- Consider constraining max-width or adjusting the two-column grid proportions

**L2: Stat cards on mobile stack to single column**
- At 375px, the 3 stat cards (past consultations / medicines / date) each occupy full width
- Visually heavy; consider 3-column grid even on mobile for compact stat display

**L3: Visit IDs displayed as raw UUIDs (partial)**
- "Visit 70e184cb" is shown in the portal card — could show date or visit number instead

## Acceptance Criteria Review

| Criterion | Status | Notes |
|-----------|--------|-------|
| Patient portal lists finalized visits | PASS | Lists 1 visit with preview text |
| Visit detail shows bilingual summary (EN/MS) | FAIL | Page crashes with "code undefined" |
| EN/MS toggle switches content | FAIL | Cannot reach toggle — page crashes |
| Doctor attribution shown on summary | FAIL | Would work if page loaded |
| Medication cards rendered | FAIL | Page crashes before rendering |
| Red flags / follow-up cards rendered | FAIL | Page crashes before rendering |
| Consent flow gates portal access | PARTIAL | UI correct; POST fails (C1, C2, C3) |
| PDPA consent 3-checkbox + disabled button | PASS | Correct behavior observed |
| Doctor dashboard shows visit list | PASS | Real data, grouped correctly |
| Doctor visit detail with PhaseTabs | PASS | Loads with real data |
| RBAC: staff/admin redirect unauthenticated | PASS | Both redirect to /login |

## Scores

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Functionality | 4/10 | 0.3 | 1.2 |
| Craft | 7/10 | 0.3 | 2.1 |
| Design | 8/10 | 0.2 | 1.6 |
| Completeness | 5/10 | 0.2 | 1.0 |
| **TOTAL** | | | **5.9 / 10** |

### Scoring Rationale

**Functionality (4/10):** The core deliverable — patient reading their post-visit summary — is completely broken due to the "code undefined" crash on visit detail. Consent flow is broken (double prefix + missing backend endpoint). Doctor dashboard works well with real data. Pre-visit chat renders. RBAC guards work. But the two most user-visible patient flows (consent → portal → read summary) both fail.

**Craft (7/10):** Code structure is clean: proper TypeScript types, correct `useEffect` patterns, good error boundaries, `apiGet`/`apiPost` abstraction. The double `/api/` prefix bug in consent page is a copy-paste error. The missing `BACKEND_URL` in docker-compose is a deployment oversight. No hardcoded secrets. Auth correctly reads from `CustomUserDetails` server-side.

**Design (8/10):** The visual language is distinctive, coherent, and feels genuinely appropriate for a Malaysian clinic product. Typography (Cormorant Garamond), color palette (deep teal + terracotta + parchment), and component styling are all consistent and professional. Minor issues: hero whitespace at 1440px, mobile stats stacking.

**Completeness (5/10):** Patient portal API endpoint works from curl but broken from browser. Doctor dashboard tab pages (/queue, /finalized) missing. Backend missing consent endpoint. EN/MS toggle implemented in code but untestable due to crash. All the code is there — deployment configuration gaps and one path bug prevent completion.

## Verdict: BLOCK

The sprint's primary patient-facing feature — reading a post-visit summary in the patient portal — is non-functional in the live stack. Two separate bugs work together to block the complete patient flow: (1) the consent page has a hardcoded `/api/` prefix that doubles with the base URL, preventing the patient from ever leaving /consent, and (2) the visit detail page crashes with "code undefined" because the Next.js rewrite layer intercepts API calls and returns mock/incorrect data format (missing `BACKEND_URL` in docker-compose). These are fixable issues but they are critical path failures for the sprint's acceptance criteria.
