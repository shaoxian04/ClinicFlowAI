# Evaluator Feedback — Iteration 001
**Score: 5.9 / 10 — FAIL**

## Must Fix (CRITICAL / HIGH)

1. **[C1+H3] Visit detail page crashes "code undefined" — missing BACKEND_URL in docker-compose**
   What's wrong: The browser fetch to `/api/patient/visits/{id}` receives an un-enveloped raw JSON object instead of the standard `{code:0,data:{...}}` envelope. `apiGet` reads `envelope.code` which is `undefined`, throwing `"code undefined"`. Root cause: `next.config.js` rewrites `/api/:path*` → `process.env.BACKEND_URL ?? "http://localhost:8080"`, but `BACKEND_URL` is not set in the frontend Docker container, so Next.js rewrites point to `localhost:8080` inside the container (unreachable). The response being returned is not from Spring Boot.
   How to fix: Add `BACKEND_URL: http://backend:8080` to the `frontend.environment` block in `docker-compose.yml`. This makes the Next.js rewrite correctly proxy server-side API calls through the Docker network to the Spring Boot backend.

2. **[C2] Consent page double `/api/` prefix**
   What's wrong: `app/consent/page.tsx` line 31 calls `apiPost("/api/patient/consent", ...)`. Since `lib/api.ts` prepends `BASE="/api"`, the actual URL becomes `/api/api/patient/consent` → 500.
   How to fix: Change line 31 in `app/consent/page.tsx` from:
   ```
   await apiPost<unknown>("/api/patient/consent", { ... })
   ```
   to:
   ```
   await apiPost<unknown>("/patient/consent", { ... })
   ```
   (Remove the `/api/` prefix — `apiPost` adds it automatically from `BASE`.)

3. **[C3] POST `/api/patient/consent` not implemented in Spring Boot**
   What's wrong: No controller handles `POST /api/patient/consent`. Spring Boot returns 500 "No static resource api/patient/consent".
   How to fix: Create a `ConsentController` at `my.cliniflow.controller.biz.patient.ConsentController` with `POST /api/patient/consent`. Accept `{"timestamp":"..."}` payload. Record consent in a `consent_log` table (PDPA audit). Return `{"code":0,"message":"ok","data":true}`. The frontend's graceful fallback will accept either 200 or 404 (treats 404 as stub) — so after fixing C2, a 404 would unblock the flow, but proper implementation is required for PDPA compliance.

4. **[H2] DoctorNav "Queue" and "Finalized" tabs link to 404 pages**
   What's wrong: `/doctor/queue` and `/doctor/finalized` do not exist. DoctorNav renders clickable links to these, causing 404 errors and console errors.
   How to fix: Either (a) create `frontend/app/doctor/queue/page.tsx` and `frontend/app/doctor/finalized/page.tsx` with minimal list views, OR (b) mark those tabs as disabled in `DoctorNav.tsx` until implemented. The `DoctorNavTab` type already supports `disabled?: false` — change to `disabled?: boolean` and add `disabled: true` on those tabs.

## Should Fix (MEDIUM)

1. **[M1] Previsit intake accessible by doctor role** — Add a role check in `app/previsit/new/page.tsx` useEffect: if `user.role !== "PATIENT"`, redirect to `/doctor`.

2. **[M2] Portal greeting uses email prefix** — In `app/portal/page.tsx` line 33, replace `(user.email ?? "there").split("@")[0]` with `user.fullName?.split(" ")[0] ?? "there"` to show "Pat" instead of "Patient".

3. **[M3] Consent 500 errors treated as rejection** — In `app/consent/page.tsx` lines 39-47, add `|| msg.startsWith("HTTP 500")` to the condition that proceeds optimistically: `const is404OrServerError = msg.startsWith("HTTP 404") || msg.startsWith("HTTP 500")`. This way a transient backend 500 doesn't permanently block consent.

4. **[M4] React hydration errors on visit detail** — The `ConsentGate` component reads `localStorage` synchronously during render at `typeof window !== "undefined" ? getUser() : null`. Any mismatch between server-rendered null and client-rendered value causes React #418. Move this to a `useState(null)` + `useEffect(() => setUser(getUser()))` pattern.

## Consider (LOW)

1. **[L1] Hero whitespace at 1440px** — The hero two-column layout has excessive gap between copy (left ~40%) and emblem (right ~60%) at very wide viewports. Add `max-width: 1200px; margin: 0 auto` on the hero container or use `gap` to tighten spacing.

2. **[L2] Mobile stat cards** — At 375px the 3 portal stat cards stack to full-width single column. Use `grid-template-columns: repeat(3, 1fr)` to keep them compact in a row.

3. **[L3] Visit ID in portal card** — "Visit 70e184cb" uses a UUID fragment. Consider showing "Visit on 21 Apr" or "Visit #1" instead.

## What Scored Low and Why

- **Functionality (4/10):** The core patient flow — login → consent → portal → read summary — is completely broken end-to-end. The two most important screens from this sprint (consent completion and visit detail) both fail. Doctor dashboard and pre-visit intake work but these are secondary.

- **Completeness (5/10):** The code is largely written and the API contract is correct from curl. But missing `BACKEND_URL` in docker-compose means the live stack doesn't actually connect Next.js rewrites to Spring Boot. Three backend endpoints that frontend depends on are unimplemented (consent, doctor/visits, staff/today). Two frontend pages (queue, finalized) are missing.

- **Craft (7/10):** Clean code architecture overall. The double `/api/` prefix bug is a simple copy-paste error. Missing `BACKEND_URL` is a deployment gap. No security issues found.

- **Design (8/10):** Distinctive and professional. Minor viewport-width issues only.
