# Frontend Polish — Enhancement Plan

**Date:** 2026-04-24
**Context:** Between Day 3 (post-visit + portal) and Day 4 (Graphify + Hermes). The UI needs to match demo-video quality before we add two more feature surfaces.
**Aesthetic direction (locked in):** **"Malaysian apothecary editorial"** — warm-stone paper, forest-teal ink, terracotta accent, Fraunces italic display, Outfit body, grain texture, generous white space, numbered editorial card headers. Quietly confident. Serif-forward. Not clinical, not generic SaaS.

---

## 1. Audit — what we have today

### Already on-system (keep, minor polish only)
| Page | Status |
|---|---|
| `/portal` (patient list) | ✅ Full system: eyebrow + page-title with italic `<em>`, visit-tile with forest-teal edge + staggered rise |
| `/portal/visits/[id]` | ✅ Full system: bilingual title, lang-toggle pill, summary-card with giant quote mark |
| `/doctor/visits/[id]` | ✅ Full system: 5 numbered cards (01 INTAKE → 04 PUBLISH), AI/done/error banners, gradient finalize-card |

### Off-system (these embarrass the demo)
| Page | Current state | Problem |
|---|---|---|
| `/` (home) | Plain `<ul>` of links in `system-ui` | First impression for judges is "generic dev placeholder" |
| `/login` | Inline-styled `system-ui` form, raw inputs | Breaks the visual promise the moment someone signs in |
| `/previsit/new` | Chat bubbles on `#e0f2fe` / `#f1f5f9`, inline grid | No eyebrow, no page-title, no card; looks like a different product |
| `/doctor` (dashboard) | HTML `<table>` with `#ccc` borders and `Open →` plain links | The doctor's FIRST screen — a table cell is the opposite of "apothecary editorial" |

### Cross-cutting gaps
1. **No app chrome.** No persistent header, no nav, no sign-out button, no visible role badge. Users lose orientation between `/previsit/new` → `/portal` → `/doctor`.
2. **No landing page.** `/` has no marketing weight — the video needs 5 seconds of "what is this product" and right now we'd have to show the login screen.
3. **No loading skeletons.** Every page uses `<p className="empty">Loading…</p>`. The portal tiles should ghost in; the summary card should shimmer.
4. **Hard state transitions.** Language toggle is an instant swap; finalize is a button press → a banner. The two biggest demo moments have zero visual weight.
5. **No iconography system.** The `eyebrow::before` is a 1px line, which is tasteful but monotonous across 8 pages. A tiny apothecary-glyph system (seal, vial, leaf, scroll) per section type would give the design a signature.
6. **Error states are afterthoughts.** `{error && <div className="banner banner-error">{error}</div>}` at the bottom of each page, no animation, often below the fold.

---

## 2. Differentiation — the one thing that will be remembered

Pick ONE signature element and execute it everywhere:

> **The "doctor's seal."** When the doctor clicks *Finalize & notify*, a circular wax-seal-style stamp (forest-teal with terracotta ring, Fraunces italic "Dr. name" + timestamp arranged around the circle) draws itself over the SOAP note with a 600ms stroke-dash animation. Then a soft shadow falls and the page settles. That's the demo's emotional peak.

The seal reappears — smaller, static — next to every finalized visit on the patient portal, as the "this is real, a human approved it" trust marker. It becomes the product's visual signature in the video and the README.

This single element carries the "doctor-in-the-loop" invariant visually. It's load-bearing on both tracks (design + safety).

---

## 3. Work phases

### Phase 1 — Bring stragglers onto the design system + landing page (1 day — landing is now its own half-day)

No new aesthetic, just apply what we already have.

**Files to replace:**
- `app/page.tsx` — rewrite as a full editorial landing (not just a card row; this is the product's front door):

  **Section 1 — Hero (100vh, asymmetric):**
  - Left column (60%): eyebrow with a tiny forest-teal leaf glyph + "CliniFlow AI · For Malaysian clinics"
  - Giant display headline, Fraunces italic mixed: "Clinical notes that **a doctor actually signs.**" with "a doctor actually signs" in italic primary
  - Sub (Outfit, 18px, max 52ch): "An AI scribe for SME clinics — drafts SOAP notes, translates them into plain English and Bahasa Melayu for patients, and learns your documentation style without ever touching clinical reasoning."
  - CTA row: `btn-accent` "Sign in" + ghost "See how it works ↓" (smooth-scrolls to section 2)
  - Trust row: three tiny pills — "PDPA-aware" / "Doctor-confirmed" / "Open source"
  - Right column (40%): the **doctor's seal** (Phase 3C component, static here) rendered at 280px — wax-seal on warm-stone, slight rotate(-6°), with a faint paper-shadow. Below it: a fake "finalized" stamp date in Fraunces italic + mono visit ID. This is the hero image. It tells the whole product story.
  - Background: existing grain + two radial gradients, plus a single hairline horizontal rule at the bottom of the viewport in `--line-strong`.

  **Section 2 — "Three steps" (the patient journey):**
  - Eyebrow "The flow" + page-title "From a *whispered symptom* to a summary the patient can read"
  - 3-card row with numbered editorial cards (01 / 02 / 03):
    - **01 · PRE-VISIT** — "The patient chats with an AI before arriving. You walk in with their history already structured." Card footer: tiny sample field pills (chief complaint, duration, red-flag screen).
    - **02 · VISIT** — "Paste the transcript. Get a SOAP draft in seconds. Edit every line — it's yours until you sign it." Card footer: amber "AI DRAFT" pill next to green "✓ SIGNED" pill, visually showing the distinction.
    - **03 · POST-VISIT** — "One click publishes a bilingual patient summary with medications — at Primary-6 reading level." Card footer: "EN / MS" toggle preview.
  - Cards stagger-rise on scroll (IntersectionObserver, 80ms per card).

  **Section 3 — "What makes it different" (the differentiators):**
  - Two-column split, no cards, pure typography
  - Left: eyebrow "Graphify" + Fraunces headline "Every visit feeds a *patient knowledge graph.*" + body explaining Neo4j-backed history retrieval with confidence-scored edges
  - Right: eyebrow "Hermes" + Fraunces headline "The AI learns your *style* — never your *judgment.*" + body explaining style-only rule learning, with a tiny inline code-styled example of a rejected clinical edit
  - Separator between them: a vertical hairline with a tiny apothecary glyph centered (seal or leaf)

  **Section 4 — Safety invariants (the trust anchor):**
  - Eyebrow "Non-negotiable" + page-title "Four lines we will *never* cross"
  - 4-item numbered list, each row: big Fraunces italic numeral on the left, forest-teal hairline under the number, bold Outfit statement on the right:
    1. Every AI note passes a doctor's explicit sign-off before finalization.
    2. Learned rules are about writing style only — never dosing, diagnosis, or red flags.
    3. The audit log is append-only. No delete, no edit, ever.
    4. The frontend talks to the backend. Never direct to the AI. Never direct to the graph.

  **Section 5 — Footer:**
  - Three columns: "Product" (Sign in / Pre-visit / Patient portal) · "Tech" (Next.js · Spring Boot · FastAPI · LangGraph · Neo4j · Supabase) · "Built for" (Primary-care clinics in Malaysia · PDPA-aware · Hackathon 2026)
  - Bottom line: Fraunces italic wordmark + "A CliniFlow AI hackathon submission · 2026" in mono small
  - Hairline separators, warm-stone on warm-stone-soft (slightly darker bg to terminate the page)

  **Motion budget for landing:**
  - Hero: staggered rise (eyebrow 0ms, headline 80ms, sub 160ms, CTA 240ms, seal draws in 400ms+600ms)
  - Section 2 cards: IntersectionObserver stagger on first scroll-in
  - Section 3: hairline separator grows from center on scroll-in
  - Section 4: numbers count up briefly (1 → 4) or just rise-stagger — whichever is cheaper
  - No parallax, no scroll-jacking, no framer-motion dependency. CSS + IntersectionObserver only.
- `app/login/page.tsx` — replace inline styles with the `.shell-narrow` + `.card` + `.field` + `.btn-primary` classes already in `globals.css`. Add an eyebrow + page-title. Keep demo credentials copy but format as `.pill pill-ghost`.
- `app/previsit/new/page.tsx` — rebuild on `.shell-narrow` + `.card`:
  - Eyebrow "Pre-visit intake", page-title "Tell us how you're *feeling*"
  - Chat pane becomes a `.card` with internal list
  - Bubbles: assistant = warm-stone with left forest-teal edge (same 3px bar as visit-tile); user = primary-soft background with terracotta text
  - Typing indicator: three-dot "apothecary" animation (staggered opacity pulse)
  - Input row: `.input` + `.btn-primary` "Send", not the current raw HTML
  - Completion state: the structured JSON becomes a styled `<ul>` inside a `.card` with eyebrow "What your doctor will see"
- `app/doctor/page.tsx` — **no more table.** Rebuild as a grid of visit-tiles, identical styling to `/portal` visit-tile but with additional meta row: patient name / pre-visit pill / SOAP status pill / created date. Sort by status (AI draft pending first).

**Acceptance for Phase 1:**
- Every page, on every role, reads as the same product.
- Sign in → any role → zero pages use `fontFamily: "system-ui"` anywhere.
- `npm run build` passes; no new deps.

### Phase 2 — App chrome + navigation (half a day)

**New file: `app/components/AppHeader.tsx`**
- Thin sticky header (56px), warm-stone background with 1px bottom hairline `--line`
- Left: Fraunces "CliniFlow" wordmark, the "flow" in italic primary
- Right: role pill + user email (small, mono) + sign-out ghost button
- Hidden on `/` (landing has its own treatment) and `/login`
- Rendered in `app/layout.tsx` conditionally (read `usePathname`)

**New file: `app/components/BreadcrumbBar.tsx`**
- On detail pages only (`/portal/visits/[id]`, `/doctor/visits/[id]`)
- Small, mono font: `Portal › Visit 8a3f…c4` with the visit id in `--font-mono`
- Back arrow on the left is the existing `.back-link` repurposed

**Acceptance for Phase 2:**
- Every authenticated page has AppHeader; landing and login do not.
- Click the wordmark → goes to role-appropriate home (`/portal` or `/doctor`).
- Sign-out clears `auth.ts` and routes to `/login`.

### Phase 3 — Motion + signature moments (1 day — the demo-video budget)

This is where the video comes from. Four discrete motion moments:

**A. Page-load stagger — already present for cards, extend to everything.**
- Add `.rise` utility class and apply to page-title, page-sub, status-row with `--delay-0/1/2` so the whole shell opens as one choreographed fade.
- 560ms cubic-bezier(0.2, 0.7, 0.2, 1), stagger 60ms. No longer.

**B. Language-toggle crossfade.**
- `.summary-card-body` gets a keyed React re-render on lang change. Wrap in a CSS `@keyframes crossfade` (150ms out, 250ms in, content swap at 50%).
- The toggle pill slides the active background with `::after` + transform rather than swapping classes instantly.
- Subtle: the giant quote mark rotates 4° on language switch (Fraunces is expressive — lean into it).

**C. Doctor's seal (the signature).**
- New component `app/components/DoctorsSeal.tsx`, pure inline SVG.
- 120px diameter. Outer ring: terracotta `stroke-dasharray` drawn over 600ms. Inner ring: forest-teal. Text on curve: "DR. " + doctor name + " · " + ISO date (using SVG `<textPath>`).
- Center glyph: a stylized caduceus-free, apothecary-style leaf (hand-curved, not a generic medical cross — per PRD "not clinical").
- Triggered on successful `onFinalizeAndNotify`. Full-screen backdrop fades in 30%, seal animates center, settles, then the card scrolls into place below.
- Small static version (40px) renders on every finalized visit-tile on `/portal` and in `/doctor` dashboard.

**D. Empty states — warm, illustrated, editorial.**
- Three reusable empty-state components: `NoVisits`, `NoMedications`, `NoPreVisitYet`
- Each uses a single stylized SVG illustration (60×60, two-color: primary + accent) + Fraunces italic headline + Outfit body + optional CTA
- Replace every `className="empty"` that currently shows grey italic text

**Acceptance for Phase 3:**
- Open any page → observe one unified choreographed entrance.
- Language toggle on `/portal/visits/[id]` looks intentional, not like state swap.
- Finalize flow on doctor review ends with the seal ceremony on screen.
- No page shows a bare italic "Loading…" or "Nothing here" string.

### Phase 4 — Skeleton loaders + micro-polish (half a day)

- `app/components/Skeleton.tsx` — warm-stone shimmer blocks with the grain texture underneath. Used for: portal visit list (3 ghost tiles), visit detail summary card, doctor dashboard grid.
- Focus rings: replace the 3px box-shadow with a 2px offset outline in `--primary` (matches Fraunces weight better).
- Cursor: custom CSS cursor only on CTA buttons (`.btn-accent`) — small forest-teal dot with terracotta ring. Subtle but memorable.
- Grain texture: current SVG noise is slightly too busy on large screens — reduce opacity to 0.5 × current and add a second, much larger noise layer for paper-grain "veins."

---

## 4. What we are NOT doing

- No component library (no shadcn, Radix, HeadlessUI). Design system stays in `globals.css`. Every new component is hand-built to match.
- No Tailwind. The existing CSS-variable design system is actually cohesive; adding Tailwind mid-project would double-system everything.
- No dark mode. Waste of hackathon time; demo is in daylight.
- No i18n library. Summaries are bilingual inline; UI chrome stays English (per spec).
- No new fonts. Fraunces + Outfit stay. We've built equity in them.
- No charts or data viz (that's Day 4's React Flow graph view, separate concern).

---

## 5. Risk & cut order

| Risk | Mitigation |
|---|---|
| Phase 3 seal animation eats a full day | Time-box 3h. Fallback: static SVG seal, no draw animation — still signature, just less cinematic. |
| React re-renders break lang-toggle crossfade | Use CSS-only `animation` on a keyed `<div>` — no framer-motion dependency needed. |
| Header breaks on mobile | Ship desktop-first for the demo video. Add one `@media (max-width: 640px)` rule collapsing the user pill to avatar initial. |

**Cut order if time short (drop in this sequence):**
1. Phase 4 skeleton shimmer (use cross-faded empty-state instead)
2. Phase 3D illustrated empty states (use Phase 1 styled text)
3. Phase 3B language crossfade (keep hard swap)
4. Phase 2 breadcrumbs (keep only AppHeader)

**Never cut:**
- Phase 1 entirely (non-conforming pages are a visual bug, not polish)
- Phase 3C the seal (that's the signature)

---

## 6. Exit criteria for the whole plan

- Every page in the app uses `globals.css` classes. Zero `style={{ fontFamily: "system-ui" ... }}` remain in any `*.tsx`.
- Authenticated pages have `AppHeader`; landing and login do not.
- The doctor's seal animates on finalize and renders statically on finalized visits.
- `npm run build && npm run typecheck` both pass.
- Open http://localhost on a fresh `docker compose up` — the first 10 seconds look like a real product, not a hackathon.

---

## 7. Handoff

After approval, break this into per-phase implementation tasks and execute Phase 1 → 2 → 3 → 4 in order. Phases 1 and 2 are mechanical (apply existing system). Phase 3 is where the design investment compounds. Phase 4 is optional polish.

**Estimated total:** ~3 days (landing page bumped Phase 1 from 0.5d to 1d). Split recommendation:
- **Before Day 4 (Graphify):** Phase 1 (landing + conforming pages) + Phase 2 (chrome) — 1.5 days. Day 4 then inherits both the chrome and the visual language.
- **On Day 5 (scheduled as "RBAC + polish"):** Phase 3 (seal + motion) + Phase 4 (skeletons) — 1.5 days, runs alongside RBAC.

One caveat: the **doctor's seal** component from Phase 3C is referenced by the landing hero. Ship a minimal static SVG version of it during Phase 1 (no animation, no draw-in), then upgrade it to the animated finalize-ceremony version in Phase 3. That way the landing has its hero image from day one and we don't block on animation polish.
