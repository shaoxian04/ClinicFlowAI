# Frontend Hackathon Polish: Obsidian + Electric

## Goal

Transform the warm-paper "Clinical Editorial" frontend into a near-black dark-mode aesthetic with electric cyan/coral accents plus 5 "wow moments" (animated KPI counters, live agent thinking trail, signature stamp, Command-K palette, ink-bleed bilingual crossfade).

## Context

| File | Role |
|------|------|
| `frontend/design/tokens.ts` | JS token constants: colors, fonts, radii, shadows, spacing, motion durations |
| `frontend/design/variants.ts` | cva variant factories for Button, Card, Badge, Input, IconButton |
| `frontend/design/motion.ts` | framer-motion Variants presets (fadeUp, staggerChildren, revealEditorial, slideInRight) |
| `frontend/app/globals.css` | CSS custom properties, base styles, legacy staff/admin class block |
| `frontend/tailwind.config.ts` | Tailwind theme extension mapping tokens to utility classes |
| `frontend/app/layout.tsx` | Root layout: font CSS vars, body element, AppHeader mount |
| `frontend/components/ui/StatTile.tsx` | KPI tile primitive (currently bone Card with display 2xl) |
| `frontend/components/ui/Badge.tsx` | Badge primitive (neutral/primary/good/warn/danger/draft/review/published) |
| `frontend/components/ui/Card.tsx` | Card primitive (paper/slate/bone variants) |
| `frontend/components/ui/Button.tsx` | Button primitive (wraps buttonVariants from variants.ts) |
| `frontend/components/ui/Separator.tsx` | Horizontal rule using hairline |
| `frontend/app/doctor/page.tsx` | Doctor dashboard with 3 StatTiles + visit groups |
| `frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx` | Orchestrates GenerateBar + ReportPanel + ReportChatPanel |
| `frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx` | Transcript input + generate button; `generating` state lives here |
| `frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx` | SOAP report editor; AI DRAFT / Signed badges; approve button |
| `frontend/lib/agentSse.ts` | SSE parser (DO NOT MODIFY). Events: turn.start, reasoning.delta, tool.call, tool.result, message.delta, clarification.needed, turn.complete, agent.error |
| `frontend/app/portal/visits/[visitId]/page.tsx` | Patient visit detail with EN/MS toggle, 90ms opacity crossfade |

### Files that reference old tokens (grep results, must migrate in Phase II-1)

**App pages** (exclude staff/admin):
- `frontend/app/page.tsx` (landing)
- `frontend/app/login/page.tsx`
- `frontend/app/privacy/page.tsx`
- `frontend/app/previsit/new/page.tsx`
- `frontend/app/portal/page.tsx`
- `frontend/app/portal/visits/[visitId]/page.tsx`
- `frontend/app/portal/components/RedFlagsCard.tsx`
- `frontend/app/portal/components/MedicationCard.tsx`
- `frontend/app/portal/components/VisitCard.tsx`
- `frontend/app/components/PortalNav.tsx`
- `frontend/app/components/AppHeader.tsx`
- `frontend/app/doctor/page.tsx`
- `frontend/app/doctor/finalized/page.tsx`
- `frontend/app/doctor/queue/page.tsx`
- `frontend/app/doctor/components/VisitRow.tsx`
- `frontend/app/doctor/components/PhaseTabs.tsx`
- `frontend/app/doctor/components/PatientContextPanel.tsx`
- `frontend/app/doctor/components/ReportPreview.tsx`
- `frontend/app/doctor/visits/[visitId]/page.tsx`
- `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`
- `frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.tsx`
- `frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx`
- `frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx`
- `frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx`
- `frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx`
- `frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx`

**UI primitives**:
- `frontend/components/ui/Card.tsx`
- `frontend/components/ui/Badge.tsx`
- `frontend/components/ui/Button.tsx` (via variants.ts)
- `frontend/components/ui/StatTile.tsx`
- `frontend/components/ui/Separator.tsx`
- `frontend/components/ui/Skeleton.tsx`
- `frontend/components/ui/EmptyState.tsx`
- `frontend/components/ui/PullQuote.tsx`
- `frontend/components/ui/SectionHeader.tsx`
- `frontend/components/ui/DataRow.tsx`
- `frontend/components/ui/Toast.tsx`
- `frontend/components/ui/Dialog.tsx`
- `frontend/components/ui/Tabs.tsx`
- `frontend/components/ui/Field.tsx`
- `frontend/components/ui/Label.tsx`
- `frontend/components/ui/Checkbox.tsx`
- `frontend/components/ui/Select.tsx`
- `frontend/components/ui/Textarea.tsx`
- `frontend/components/ui/Input.tsx`
- `frontend/components/ui/AppShell.tsx`
- `frontend/components/ui/Kbd.tsx`
- `frontend/components/ui/PhasedSpinner.tsx`
- `frontend/components/ui/IconButton.tsx` (via variants.ts)

**DO NOT touch** (staff/admin pages use legacy CSS classes that reference CSS vars, not tailwind tokens):
- `frontend/app/staff/page.tsx`
- `frontend/app/admin/audit/page.tsx`
- `frontend/app/admin/analytics/page.tsx`
- `frontend/app/admin/users/page.tsx`

## Constraints & Risks

1. **WCAG AA contrast**: All text on `--obsidian (#0A0F1A)` must meet 4.5:1 for body, 3:1 for large text.
   - `--fog (#E9EEF5)` on `--obsidian`: contrast ~15.2:1 -- passes AAA.
   - `--fog-dim (#93A0B5)` on `--obsidian`: contrast ~7.2:1 -- passes AA.
   - `--cyan (#22E1D7)` on `--obsidian`: contrast ~10.5:1 -- passes AAA.
   - `--coral (#FF7759)` on `--obsidian`: contrast ~6.2:1 -- passes AA.
   - `--lime (#B8FF5C)` on `--obsidian`: contrast ~14.3:1 -- passes AAA.
   - `--amber (#F7B23B)` on `--obsidian`: contrast ~8.8:1 -- passes AA.
   - `--crimson (#FF4D5E)` on `--obsidian`: contrast ~5.5:1 -- passes AA.
   - `--fog-dim` on `--ink-well (#0E1424)`: contrast ~6.7:1 -- passes AA.

2. **Legacy staff/admin CSS**: The legacy block in `globals.css` references CSS vars (`--surface`, `--ink`, `--bg`, etc.). We must update the compatibility aliases so they resolve sensibly in the dark context. Currently `--bg: var(--paper)`, `--surface: var(--paper)`, `--ink: #141414`. When we replace `--paper` with obsidian, these vars break the staff/admin pages. **Solution**: Leave the compatibility aliases block pointing to the OLD values. The staff/admin pages render with these vars; they will remain light-themed. This means we need a **dual-theme approach**: the new Obsidian tokens go in new CSS vars, the old vars stay for legacy. The body class switches to `bg-obsidian text-fog`, but the legacy CSS still uses `var(--surface)` etc. which remain light. Staff/admin pages will look light on a dark body -- to fix this, wrap staff/admin routes in a `.legacy-light` class that resets `background` and `color` on their outermost shell, OR accept the light-on-dark since their `.shell` container has explicit `background: var(--surface)`.

   **Decision**: The staff/admin pages already wrap content in `.shell` which has no explicit background (it inherits body). The `.staff-nav`, `.admin-nav`, `.staff-card`, `.admin-card`, `.patient-row`, `.waiting-row` all set `background: var(--surface)`. So as long as `--surface` remains `#F6F1E6` (paper), those elements look correct. The `.shell` container itself has no background. We must add `background: var(--surface); color: var(--ink);` to `.shell` in the legacy block so staff/admin pages get a light background.

3. **Playwright selectors**: No renames of `role`, `aria-label`, `data-testid`, or semantic element selectors. All `role="tab"`, `role="tablist"`, `role="alert"`, `aria-label="..."`, `#transcript-ta`, `.sr-only`, button text content must stay.

4. **No changes to `lib/api.ts`, `lib/auth.ts`, `lib/reviewReducer.ts`, `lib/agentSse.ts`**.

5. **SSE accessibility during sync-generate**: `SplitReview.handleGenerate()` calls `apiPost("/visits/{id}/report/generate-sync")` which is a standard POST, not an SSE stream. The SSE parser in `agentSse.ts` consumes a streaming `Response`. The sync-generate endpoint returns a single JSON payload. There is no evidence of a separate SSE events endpoint being opened during sync-generate. **Decision for Wow #2**: Use a **scripted fallback** timeline. Document this in the file header.

6. **`cmdk` package**: Must be installed. Version `^1.0.0`. It depends on Radix Dialog internally.

---

## Phases

### Phase II-1 -- Palette + Design System Overhaul

**Scope:** Replace all paper/ink/oxblood/sage/bone tokens with the Obsidian + Electric palette across design system files, CSS vars, tailwind config, cva variants, UI primitives, and every page/component file (except staff/admin pages). Add `.noise-overlay` and `.glow-cyan` utility classes. Fix legacy compatibility aliases for staff/admin pages.

**Steps:**

1. **`frontend/design/tokens.ts`** -- Replace `colors` object:
   - Remove: `paper`, `bone`, `ink`, `inkSoft`, `oxblood`, `sage`, `ochre`, `crimson`, `slate`, `hairline`, `primary`, `success`, `warning`, `danger`.
   - Add: `obsidian: "#0A0F1A"`, `inkWell: "#0E1424"`, `inkRim: "#1A2133"`, `fog: "#E9EEF5"`, `fogDim: "#93A0B5"`, `cyan: "#22E1D7"`, `cyanSoft: "rgba(34,225,215,0.15)"`, `coral: "#FF7759"`, `lime: "#B8FF5C"`, `amber: "#F7B23B"`, `crimson: "#FF4D5E"`, `mica: "#2A3346"`, `primary: "#22E1D7"`, `success: "#B8FF5C"`, `warning: "#F7B23B"`, `danger: "#FF4D5E"`.
   - Update `shadows`: `card: "inset 0 1px 0 rgba(255,255,255,0.04)"`, `elevated: "0 0 18px rgba(34,225,215,0.12)"`.

2. **`frontend/tailwind.config.ts`** -- Replace `colors` in theme.extend:
   - Map every new token name. Remove old names. Add `"ink-well"`, `"ink-rim"`, `"fog-dim"`, `"cyan-soft"` keys.
   - Keep `fontFamily`, `borderRadius` unchanged.

3. **`frontend/app/globals.css`** -- In `@layer base :root`:
   - Replace old CSS vars with: `--obsidian`, `--ink-well`, `--ink-rim`, `--fog`, `--fog-dim`, `--cyan`, `--cyan-soft`, `--coral`, `--lime`, `--amber`, `--crimson`, `--mica`.
   - Update compatibility aliases: keep ALL of them but now `--bg: var(--paper)` stays as `--bg: #F6F1E6` (hardcode the old paper value), `--surface: #F6F1E6`, `--surface-2: #E8DFCE`, `--ink: #141414` (keep for legacy), `--ink-2: #3B3A35`, `--line: #D9D1BE`, etc. The legacy staff/admin CSS refs these vars and must continue to see light-mode values.
   - Add `--paper: #F6F1E6;` as a legacy-only var (no longer used by tailwind, but CSS legacy classes reference it).
   - Update body rule: `@apply bg-obsidian text-fog font-sans antialiased;`
   - Add `.shell { background: #F6F1E6; color: #141414; }` -- add `background` and `color` to the existing `.shell` rule so staff/admin pages get a light container.
   - Add `.noise-overlay` utility class:
     ```css
     .noise-overlay::before {
       content: "";
       position: fixed;
       inset: 0;
       pointer-events: none;
       z-index: 50;
       opacity: 0.03;
       background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='256' height='256' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
       background-repeat: repeat;
       background-size: 256px 256px;
     }
     ```
   - Add `.glow-cyan` utility class:
     ```css
     .glow-cyan {
       text-shadow: 0 0 18px rgba(34,225,215,0.4);
     }
     ```
   - Update focus-visible ring: `outline: 2px solid var(--cyan);` instead of `var(--accent)`.
   - Keep entire legacy block (line ~80-846) intact except the `.shell` background addition.

4. **`frontend/design/variants.ts`** -- Update all cva factories:
   - `buttonVariants`: `primary` -> `bg-cyan text-obsidian hover:bg-cyan/90`, `secondary` -> `border border-ink-rim bg-ink-well text-fog hover:bg-mica`, `ghost` -> `text-fog-dim hover:bg-ink-well`, `destructive` -> `bg-crimson text-fog hover:bg-crimson/90`, `link` -> `text-cyan underline-offset-4 hover:underline`.
   - `cardVariants`: rename variants -- `paper` -> `bg-ink-well border border-ink-rim` (keep variant name `paper` for code compat), `slate` -> `bg-obsidian text-fog border border-ink-rim`, `bone` -> `bg-mica border border-ink-rim`.
   - `badgeVariants`: `neutral` -> `bg-mica text-fog-dim`, `primary` -> `bg-cyan/10 text-cyan`, `good` -> `bg-lime/10 text-lime`, `warn` -> `bg-amber/10 text-amber`, `danger` -> `bg-crimson/10 text-crimson`, `draft` -> `bg-coral/10 text-coral border-l-2 border-coral`, `review` -> `bg-amber/10 text-amber`, `published` -> `bg-lime/10 text-lime`.
   - `inputVariants`: `border-ink-rim bg-ink-well text-fog placeholder:text-fog-dim/50 focus:ring-1 focus:ring-cyan/40`.
   - `iconButtonVariants`: mirror `buttonVariants` changes.

5. **`frontend/app/layout.tsx`** -- Add `noise-overlay` class to `<body>`:
   ```tsx
   <body className="noise-overlay">
   ```
   (The body already gets `bg-obsidian text-fog` from `globals.css` base rule.)

6. **UI primitives** -- For each of these files, do a find-replace of old token class names:
   - Mapping: `bg-paper` -> `bg-ink-well`, `bg-bone` -> `bg-mica`, `text-ink` -> `text-fog` (but NOT `text-ink-soft` yet), `text-ink-soft` -> `text-fog-dim`, `border-hairline` -> `border-ink-rim`, `text-oxblood` -> `text-coral`, `bg-oxblood` -> `bg-coral`, `oxblood` (in ring/border contexts) -> `cyan` (for focus rings) or `coral` (for accent borders), `text-sage` -> `text-lime`, `bg-sage` -> `bg-lime`, `text-ochre` -> `text-amber`, `bg-ochre` -> `bg-amber`, `text-crimson` -> `text-crimson` (stays same name but new hex), `bg-crimson` -> `bg-crimson`.
   - Files: `Card.tsx`, `Badge.tsx`, `Button.tsx`, `StatTile.tsx`, `Separator.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `PullQuote.tsx`, `SectionHeader.tsx`, `DataRow.tsx`, `Toast.tsx`, `Dialog.tsx`, `Tabs.tsx`, `Field.tsx`, `Label.tsx`, `Checkbox.tsx`, `Select.tsx`, `Textarea.tsx`, `Input.tsx`, `AppShell.tsx`, `Kbd.tsx`, `PhasedSpinner.tsx`, `IconButton.tsx`.

7. **App pages** -- Same token migration for every file in the "App pages" list above. Key mappings:
   - `bg-paper` -> `bg-obsidian` (for page backgrounds) or `bg-ink-well` (for card-level containers)
   - `bg-bone/50` -> `bg-mica/50`
   - `text-ink` (standalone) -> `text-fog`
   - `text-ink-soft` -> `text-fog-dim`
   - `text-ink-soft/50`, `text-ink-soft/60`, `text-ink-soft/40` -> `text-fog-dim/50`, `text-fog-dim/60`, `text-fog-dim/40`
   - `border-hairline` -> `border-ink-rim`
   - `text-oxblood` -> `text-cyan` (for accent text like active tabs, links, emphatic words)
   - `border-oxblood` -> `border-cyan` (for active tab indicators)
   - `bg-oxblood` -> `bg-coral` (for primary action backgrounds -- BUT primary buttons now use cyan; accent/AI-related use coral)
   - `hover:bg-oxblood/90` -> `hover:bg-cyan/90`
   - `hover:text-oxblood` -> `hover:text-cyan`
   - `focus:ring-oxblood/40` -> `focus:ring-cyan/40`
   - `focus:border-oxblood/40` -> `focus:border-cyan/40`
   - `accent-oxblood` -> `accent-cyan`
   - `border-l-oxblood` -> `border-l-coral` (AI draft marker)
   - `bg-crimson/10` -> `bg-crimson/10` (same name, new hex)
   - `border-crimson/30` -> `border-crimson/30`
   - In `ReportPanel.tsx`: `bg-paper` in inputCls/textareaCls -> `bg-ink-well`, `border-hairline` -> `border-ink-rim`, `text-ink` -> `text-fog`, `ring-oxblood` -> `ring-cyan`, `border-oxblood` -> `border-cyan`, `bg-bone/40` -> `bg-mica/40`.
   - In `GenerateBar.tsx`: same pattern. `bg-oxblood` on mic button -> `bg-coral`, `border-oxblood` -> `border-coral`, `hover:bg-oxblood/90` -> `hover:bg-coral/90`, `bg-oxblood/5` -> `bg-cyan/5` for drag highlight.
   - In portal page: `text-oxblood` -> `text-cyan`, `border-oxblood` -> `border-cyan`, `hover:border-oxblood` -> `hover:border-cyan`.

8. **`frontend/design/motion.ts`** -- No changes in this phase (motion presets added in later phases).

**Verify commands:**
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run build
cd frontend && npm run lint
```

**Preserved selectors to re-verify:**
- `role="tab"`, `role="tablist"`, `role="alert"` -- unchanged
- `aria-label="Consultation transcript"`, `aria-label="Upload audio file"`, `aria-label="Start live recording"`, `aria-label="Stop recording"`, `aria-label="Remove medication"`, `aria-label="Language"` -- unchanged
- `#transcript-ta` -- unchanged
- `.sr-only` / `<h2 className="sr-only">Report</h2>` -- unchanged
- Button text "Generate report", "Approve & continue", "Approved ..." -- unchanged

**Phase II-1 Done When:**
- [ ] `npm run build` passes with zero errors
- [ ] Every page (landing, login, privacy, previsit, portal, portal visit detail, doctor dashboard, doctor visit detail, doctor queue, doctor finalized) renders on obsidian background with fog text and cyan/coral accents -- no paper/ink/oxblood/sage/bone references remain in non-legacy code
- [ ] Staff and admin pages still render with light backgrounds via legacy CSS vars

---

### Phase II-2 -- Animated KPI Counters

**Scope:** Replace static StatTiles on the doctor dashboard with spring-animated counting numerals + 7-day sparklines.

**Steps:**

1. **`frontend/design/motion.ts`** -- Add `countUp` preset:
   ```ts
   export const countUp = {
     stiffness: 120,
     damping: 20,
     mass: 1,
   };
   ```
   (This is a spring config object, not a Variants; it will be passed to `useSpring`.)

2. **New: `frontend/components/ui/AnimatedStatTile.tsx`**
   - Props: `label: string`, `value: number`, `sparklineData?: number[]` (array of 7 numbers), `className?: string`.
   - Uses framer-motion `useMotionValue(0)` + `useSpring(motionValue, countUp)` to animate from 0 to `value` on mount.
   - Renders in a Card with `variant="bone"` (which now maps to `bg-mica border-ink-rim`).
   - Value displayed via JetBrains Mono (`font-mono text-4xl`) with `.glow-cyan` class.
   - Use `useTransform` + `motion.span` to round the spring value to an integer for display.
   - Below the value, if `sparklineData` is provided and has >1 points, render an inline SVG `<polyline>` sparkline: 80px wide, 24px tall, stroke `currentColor` with `text-cyan/60`, strokeWidth 1.5, no fill. Normalize data points to fit the 24px height.
   - Label in `text-xs text-fog-dim uppercase tracking-wider font-sans mt-1`.
   - Wrap in `<motion.div>` with `fadeUp` variant for stagger entry.
   - `prefers-reduced-motion`: if `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, skip spring -- just render the final value immediately.

3. **`frontend/app/doctor/page.tsx`** -- Replace StatTile usage:
   - Import `AnimatedStatTile` instead of `StatTile`.
   - Add sparkline derivation: for each of the 3 KPI categories (awaiting, today, finalized), compute an array of 7 values representing the count of matching visits for each of the past 7 days. Use `visits` array + `createdAt` field. Pure client-side:
     ```ts
     function computeSparkline(visits: VisitSummary[], filterFn: (v: VisitSummary) => boolean): number[] {
       const now = new Date();
       return Array.from({ length: 7 }, (_, i) => {
         const d = new Date(now);
         d.setDate(d.getDate() - (6 - i));
         const dayStr = d.toISOString().slice(0, 10);
         return visits.filter(v => v.createdAt.slice(0, 10) === dayStr && filterFn(v)).length;
       });
     }
     ```
   - Replace `<StatTile label="..." value={...} />` x3 with `<AnimatedStatTile label="..." value={...} sparklineData={...} />`.
   - Remove `StatTile` import.
   - Widen `max-w-sm` to `max-w-md` on the KPI strip grid so sparklines have room.

**Verify commands:**
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

**Preserved selectors:**
- `role="tab"`, `role="tablist"` on group tabs -- unchanged
- Visit row links -- unchanged

**Phase II-2 Done When:**
- [ ] KPI tiles animate from 0 to their value with a spring on page load
- [ ] Sparkline SVGs render below each counter (may be flat/zero in dev if visit data is sparse)
- [ ] `npm run build` passes

---

### Phase II-3 -- Live Agent Thinking Trail

**Scope:** Add a horizontal pill strip below the GenerateBar that shows scripted agent-step progress during report generation.

**Fallback decision:** The current `handleGenerate` in `SplitReview.tsx` uses `apiPost` (sync POST, not SSE). There is no separate SSE endpoint opened during the sync-generate call. The `agentSse.ts` helper is designed for a streaming response, which is not what `generate-sync` returns. **Therefore we use the scripted fallback timeline.** This decision is documented in the component file header.

**Steps:**

1. **New: `frontend/app/doctor/visits/[visitId]/components/review/AgentThinkingTrail.tsx`**
   - File header comment: `// Scripted fallback: the sync-generate endpoint does not expose an SSE stream. // When a streaming endpoint is available, replace the timer-based steps with real agentSse events.`
   - Props: `active: boolean` (true when generating), `onComplete?: () => void`.
   - Internal state: `currentStep: number` (0-based index into a steps array).
   - Steps array (constant):
     ```ts
     const STEPS = [
       { label: "get_patient_context", delayMs: 800 },
       { label: "clinical_dictionary_extract", delayMs: 1200 },
       { label: "drafting_soap_note", delayMs: 2000 },
       { label: "drug_interaction_check", delayMs: 1000 },
       { label: "finalizing", delayMs: 600 },
     ];
     ```
   - When `active` becomes true, start advancing `currentStep` on a timer matching the `delayMs` of each step. When `active` becomes false OR all steps complete, stop. Reset `currentStep` to 0 when `active` goes false->true.
   - Visual: a horizontal `<div className="flex gap-2 overflow-x-auto py-2 px-1">`. Each step is a pill:
     - Base: `rounded-xs border border-cyan/30 px-2.5 py-1 font-mono text-[11px]`
     - Future: `text-fog-dim/40 border-ink-rim`
     - Current: `text-cyan border-cyan/60 shadow-[0_0_8px_rgba(34,225,215,0.2)]` + a shimmer keyframe animation (horizontal gradient sweep, 1.5s infinite). Define the shimmer keyframe in the component via a `<style>` tag or in globals.css.
     - Past: `text-fog-dim/60 border-ink-rim`
     - Active pill also gets a coral dot (4px circle) pulsing to the left of the label text.
   - Wrap the entire strip in `<AnimatePresence>` + `<motion.div>` with `fadeUp` entry and fade-out exit.
   - `prefers-reduced-motion`: skip shimmer animation, just show static highlighted pill.

2. **Add shimmer keyframe to `frontend/app/globals.css`** (at the bottom, before the reduced-motion block):
   ```css
   @keyframes shimmer-cyan {
     0% { background-position: -200% 0; }
     100% { background-position: 200% 0; }
   }
   ```

3. **`frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx`** -- Mount the trail:
   - Import `AgentThinkingTrail`.
   - Render `<AgentThinkingTrail active={state.generating} />` between `<GenerateBar ... />` and the `<div className="grid ...">` report/chat grid.

**Verify commands:**
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

**Preserved selectors:**
- `role="alert"` on error div -- unchanged
- GenerateBar button text -- unchanged
- SplitReview grid layout -- unchanged

**Phase II-3 Done When:**
- [ ] When "Generate report" is clicked, a horizontal strip of 5 pills appears below the GenerateBar
- [ ] Pills advance sequentially with cyan glow on the current one and coral pulse dot
- [ ] Strip disappears (with exit animation) when generation completes
- [ ] `npm run build` passes

---

### Phase II-4 -- Signature Stamp

**Scope:** Add a wax-seal SVG stamp that animates onto the report when the doctor approves.

**Steps:**

1. **`frontend/design/motion.ts`** -- Add `stampSettle` preset:
   ```ts
   export const stampSettle: Variants = {
     initial: {
       opacity: 0,
       scale: 1.3,
       rotate: 18,
     },
     animate: {
       opacity: 0.95,
       scale: 1,
       rotate: -2,
       transition: {
         type: "spring",
         stiffness: 180,
         damping: 14,
         mass: 0.8,
         duration: 0.6,
       },
     },
   };
   ```

2. **New: `frontend/components/ui/SignatureStamp.tsx`**
   - Props: `doctorName?: string`, `visible: boolean`.
   - Renders an SVG wax-seal: a `<circle>` in coral (`#FF7759`) with subtle radial gradient for depth, containing:
     - "CliniFlow" text along a circular `<textPath>` at the rim in small caps, 8px, fog color.
     - A centered checkmark `<path>` in fog.
     - Doctor initials (first letter of first + last name from `doctorName`, or empty) rendered as `<text>` in the center-bottom, mono font, 10px.
   - SVG dimensions: 80x80, `viewBox="0 0 80 80"`.
   - Wrap in `<AnimatePresence>` + `<motion.div>` with `stampSettle` variants. Only render when `visible` is true.
   - Position: `absolute top-4 right-4`, `pointer-events-none`, `opacity-60` (the 0.95 from spring settles then we css-override to 0.6 for watermark effect via a `className`).
   - Includes `<span className="sr-only">Signed by {doctorName}</span>` for accessibility.
   - `prefers-reduced-motion`: skip animation, render at final position instantly.

3. **`frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx`** -- Mount stamp:
   - Import `SignatureStamp`.
   - The report `<section>` needs `relative` positioning: add `relative` to the section's className.
   - After the header row (the `<div>` with the Badge + Approve button), render:
     ```tsx
     <SignatureStamp visible={approved || locked} doctorName={/* need to pass through */} />
     ```
   - **Prop threading**: `ReportPanelProps` currently has no `doctorName`. Add `doctorName?: string` to the props. Thread it from `SplitReview` which will need to pass it.

4. **`frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx`** -- Pass doctorName:
   - Import `getUser` from `@/lib/auth`.
   - In the component body: `const user = getUser();` and pass `doctorName={user?.fullName}` to `<ReportPanel>`.
   - Add `doctorName` to `SplitReviewProps` interface? No -- get it locally from `getUser()`. Just call it inside SplitReview and pass down.

**Verify commands:**
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

**Preserved selectors:**
- `<h2 className="sr-only">Report</h2>` -- unchanged
- `<Badge variant="draft">AI DRAFT</Badge>` -- unchanged
- `<Badge variant="published">Signed</Badge>` -- unchanged
- Approve button text "Approve & continue" / "Approved ..." -- unchanged

**Phase II-4 Done When:**
- [ ] When the report transitions to approved state, a coral wax-seal stamp animates in from the top-right with spring physics
- [ ] Stamp shows "CliniFlow" + checkmark + doctor initials
- [ ] Stamp settles as a 60%-opacity watermark that does not block clicks
- [ ] `npm run build` passes

---

### Phase II-5 -- Command-K Palette

**Scope:** Install `cmdk` and add a global Cmd/Ctrl+K command palette with navigation, recent visits, phase tab switching, language toggle, and sign-out.

**Steps:**

1. **Install**: `cd frontend && npm install cmdk@^1.0.0`

2. **New: `frontend/components/ui/CommandPalette.tsx`**
   - Uses `cmdk` `Command` component (dialog mode via `Command.Dialog`).
   - Props: `open: boolean`, `onOpenChange: (open: boolean) => void`.
   - Visual: centered overlay dialog. Outer wrapper: `fixed inset-0 z-50 flex items-start justify-center pt-[20vh]`. Backdrop: `bg-obsidian/60 backdrop-blur-sm`. Dialog: `w-full max-w-lg bg-ink-well border border-ink-rim rounded-sm shadow-elevated overflow-hidden`.
   - Input: `Command.Input` styled with `bg-transparent border-b border-ink-rim px-4 py-3 text-fog font-sans text-sm placeholder:text-fog-dim/50 focus:outline-none w-full`.
   - List: `Command.List` with `max-h-72 overflow-y-auto p-2`.
   - Items: `Command.Item` styled with `px-3 py-2 text-sm font-mono text-fog rounded-xs cursor-pointer data-[selected=true]:bg-cyan/10 data-[selected=true]:text-cyan flex items-center gap-3`.
   - Groups:
     - **Navigate**: items for `/doctor` ("Dashboard"), `/doctor/queue` ("Queue"), `/doctor/finalized` ("Finalized"), `/portal` ("Patient Portal").
     - **Recent visits**: on first open, call `apiGet<VisitSummary[]>("/visits")` and cache in a `useRef`. Show top 10 as items linking to `/doctor/visits/{visitId}`. Display patient name + status.
     - **Actions**: "Sign out" (calls `clearUser()` from auth + `router.push("/login")`).
   - Each group has a `Command.Group` with `heading` prop styled in `text-[10px] font-mono text-fog-dim uppercase tracking-widest px-3 py-1.5`.
   - cmdk handles keyboard navigation (up/down/enter/esc) natively.
   - On item select: `router.push(path)` + `onOpenChange(false)`.
   - Entrance animation: use framer-motion `AnimatePresence` + `motion.div` with `fadeUp` for the dialog.

3. **New: `frontend/components/CommandPaletteProvider.tsx`**
   - `"use client"` component.
   - State: `open: boolean`.
   - Effect: register global `keydown` listener for `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux). `e.preventDefault()` + `setOpen(true)`.
   - Renders `<CommandPalette open={open} onOpenChange={setOpen} />`.
   - Returns `<>{children}{palette}</>` so it wraps children transparently.

4. **`frontend/app/layout.tsx`** -- Mount provider:
   - Import `CommandPaletteProvider`.
   - Wrap `{children}` (but NOT `<AppHeader />` -- palette should overlay everything):
     ```tsx
     <body className="noise-overlay">
       <CommandPaletteProvider>
         <AppHeader />
         {children}
       </CommandPaletteProvider>
     </body>
     ```
   - Note: `CommandPaletteProvider` is a client component, but `layout.tsx` is a server component. We need to keep the provider as a client boundary that accepts `children`. This pattern is standard Next.js 14.

**Verify commands:**
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

**Preserved selectors:**
- All existing selectors untouched -- this is purely additive.

**Phase II-5 Done When:**
- [ ] Pressing Cmd/Ctrl+K opens a centered dark command palette
- [ ] Typing filters the items in real-time
- [ ] Selecting a navigation item routes to the correct page
- [ ] Esc closes the palette
- [ ] `npm run build` passes

---

### Phase II-6 -- Ink-Bleed Bilingual Crossfade

**Scope:** Replace the 90ms opacity fade on the portal visit detail page with a 200ms SVG-filter-based ink-bleed warp transition.

**Steps:**

1. **New: `frontend/components/ui/LangCrossfade.tsx`**
   - `"use client"` component.
   - Props: `lang: string` (used as key), `children: React.ReactNode`.
   - Uses an inline SVG `<defs>` block (rendered once, hidden with `position: absolute; width: 0; height: 0;`) defining a filter `#ink-bleed`:
     ```xml
     <filter id="ink-bleed">
       <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" result="turb" seed="1" />
       <feDisplacementMap in="SourceGraphic" in2="turb" scale="0" xChannelSelector="R" yChannelSelector="G" />
     </filter>
     ```
   - The `scale` attribute of `feDisplacementMap` is animated: 0 (rest) -> 25 (mid-transition) -> 0 (rest).
   - Transition logic:
     - When `lang` changes, set `transitioning = true`.
     - Use `requestAnimationFrame` + a 200ms timeout:
       - At 0ms: set filter scale to 25 (via ref to the SVG element, `setAttribute`), set opacity to 0.
       - At 100ms: swap children (update internal `displayedLang` state), set opacity back to 1.
       - At 200ms: set filter scale back to 0, set `transitioning = false`.
     - The content div has `style={{ filter: "url(#ink-bleed)" }}` applied during transition.
   - `prefers-reduced-motion`: skip filter entirely -- just swap instantly (same as current behavior but without even the 90ms delay).
   - Children are rendered inside a `<div>` that carries the filter style.

2. **`frontend/app/portal/visits/[visitId]/page.tsx`** -- Integrate:
   - Import `LangCrossfade`.
   - Remove the `transitioning` state, `timerRef`, and `switchLang` function's timer logic. Simplify `switchLang` to just `setLang(next)`.
   - Remove the `transition-opacity duration-[90ms]` and `transitioning ? "opacity-0" : "opacity-100"` from the content div.
   - Wrap the bilingual content (the `<div className="flex flex-col gap-6 ...">` and everything inside it -- PullQuote, attribution, medications, red flags, follow-up) with `<LangCrossfade lang={lang}>`.
   - Keep all other elements (back link, page header, language tabs) outside the crossfade wrapper.

**Verify commands:**
```bash
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

**Preserved selectors:**
- `role="tab"` on EN/MS buttons -- unchanged
- `role="tablist"` on language tab container -- unchanged
- `aria-selected` on language tabs -- unchanged
- `aria-label="Language"` on tablist -- unchanged

**Phase II-6 Done When:**
- [ ] Switching language on the portal visit detail page triggers a visible warp/dissolve effect lasting ~200ms
- [ ] Content swaps correctly between EN and MS
- [ ] `prefers-reduced-motion` results in instant swap with no filter
- [ ] `npm run build` passes

---

### Phase II-7 -- Final Validation + Evaluator Brief

**Scope:** Run all checks, verify visual correctness, ensure no contract drift or selector breakage.

**Steps:**

1. Run typecheck: `cd frontend && npx tsc --noEmit`
2. Run build: `cd frontend && npm run build`
3. Run lint: `cd frontend && npm run lint`
4. Run Playwright specs (if available): `cd frontend && npx playwright test` -- verify all existing tests pass. If no Playwright config exists, skip but note it.
5. Visual audit checklist (manual or via Playwright screenshots):
   - Landing page: obsidian bg, fog text, cyan CTAs
   - Login page: dark card with ink-well bg
   - Doctor dashboard: animated KPI counters with glow, sparklines
   - Doctor visit detail: thinking trail appears during generate, stamp appears on approve
   - Portal visit detail: ink-bleed crossfade on EN/MS toggle
   - Cmd+K palette: opens on shortcut, dark themed, navigates correctly
6. Contract-drift check: `diff` the `lib/api.ts`, `lib/auth.ts`, `lib/reviewReducer.ts`, `lib/agentSse.ts` files against their git HEAD versions -- must show zero changes.
7. Staff/admin smoke: verify `/staff` and `/admin/*` pages still render with light backgrounds and readable text.
8. WCAG check: spot-check fog text on obsidian (15:1), fog-dim on obsidian (7.2:1), cyan on obsidian (10.5:1). All pass AA.

**Preserved selectors (complete list across all phases):**
- `role="tab"`, `role="tablist"`, `role="alert"`
- `aria-label="Consultation transcript"`, `aria-label="Upload audio file"`, `aria-label="Start live recording"`, `aria-label="Stop recording"`, `aria-label="Remove medication"`, `aria-label="Language"`
- `#transcript-ta`
- `<h2 className="sr-only">Report</h2>`
- All button text content unchanged
- All `href` / `Link` destinations unchanged

**Phase II-7 Done When:**
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npx tsc --noEmit` exits 0
- [ ] No changes in `lib/api.ts`, `lib/auth.ts`, `lib/reviewReducer.ts`, `lib/agentSse.ts`
- [ ] Staff/admin pages render with light backgrounds

---

## Overall Acceptance Criteria

- [ ] The entire frontend renders on an obsidian (#0A0F1A) dark canvas with electric cyan (#22E1D7) and coral (#FF7759) accents
- [ ] Doctor dashboard KPI tiles animate from 0 to value with spring physics and show 7-day sparklines
- [ ] During SOAP report generation, a 5-step scripted thinking trail of cyan/coral pills advances below the transcript bar
- [ ] On report approval, a coral wax-seal SVG stamp animates in with spring bounce and settles as a watermark
- [ ] Cmd/Ctrl+K opens a command palette with navigation, recent visits, and sign out
- [ ] Portal visit detail language toggle uses an SVG ink-bleed warp crossfade transition
- [ ] All existing Playwright selectors still work
- [ ] All text meets WCAG AA contrast ratios on obsidian
- [ ] Staff and admin pages still render correctly with light legacy styling
- [ ] No changes to lib/api.ts, lib/auth.ts, lib/reviewReducer.ts, lib/agentSse.ts
- [ ] Noise overlay renders at 3% opacity across the entire app
- [ ] All animations respect `prefers-reduced-motion`

## Evaluation Rubric

- **Functionality** (weight 0.3): All 5 wow moments work as specified. KPI counters animate, thinking trail advances, stamp appears on approve, Cmd+K navigates, ink-bleed crossfade fires on lang switch. No runtime errors.
- **Craft** (weight 0.3): Token migration is complete and consistent. No stale paper/ink/oxblood references in non-legacy code. Motion respects reduced-motion. WCAG AA met. No console errors or warnings. Clean component boundaries.
- **Design** (weight 0.2): Obsidian + Electric aesthetic is cohesive. Cyan glow on KPI numerals is visible. Coral accents on AI draft/thinking/stamp are distinct. Noise overlay is subtle. Dark surfaces have the "inner light" inset shadow. Typography hierarchy reads well inverted.
- **Completeness** (weight 0.2): All 7 phases fully implemented. Every file in the migration list was updated. Staff/admin pages unbroken. Build + typecheck + lint all pass. No partial implementations or TODOs left in code.
