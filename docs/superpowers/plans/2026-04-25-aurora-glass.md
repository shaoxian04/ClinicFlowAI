# Aurora-Glass Palette + SVG Illustrations

## Goal

Repaint the Obsidian+Electric frontend to Aurora-Glass aesthetic (cyan/violet/magenta/amber gradient mesh, glass-morph cards, glow halos) and add four sets of custom SVG illustrations (hero, process diagram, empty states, icon set) for hackathon visual impact.

## Context

| File | Why it matters |
|---|---|
| `frontend/design/tokens.ts` | Current color palette (obsidian, cyan, coral, lime, amber, crimson, mica). Must ADD violet `#8B5CF6`, magenta `#FF5C9C`, aurora-cyan alias. Must NOT remove existing tokens. |
| `frontend/design/variants.ts` | Card variants (`paper`/`bone`/`slate`) via CVA. Must add `glass` and `glow` variants without touching existing ones. Also has button/badge/input/iconButton variants -- leave those alone. |
| `frontend/design/motion.ts` | Motion presets (fadeUp, staggerChildren, revealEditorial, slideInRight, stampSettle, countUp). Must add `auroraPulse` breathing-glow preset here. |
| `frontend/tailwind.config.ts` | Tailwind theme.extend with colors, fonts, borderRadius, boxShadow. Must add violet/magenta colors, gradient backgroundImage utilities, new glow shadows. |
| `frontend/app/globals.css` | CSS vars, `.noise-overlay`, `.glow-cyan`, `.shimmer-pill`, LEGACY block (lines 135-946). Must add `.aurora-mesh` utility ABOVE the LEGACY block. Must NOT modify anything inside the LEGACY block. |
| `frontend/app/layout.tsx` | Root layout -- `<body className="noise-overlay">` wraps `<CommandPaletteProvider>` + `<AppHeader>` + `{children}`. Must mount `<AuroraMesh />` here, hidden on `/staff` and `/admin` paths. |
| `frontend/app/page.tsx` | Landing page with hero (lines 116-169), 3-step flow (lines 172-216), differentiators (lines 218-254), promises (lines 256-296), footer (lines 299-371). Hero has no illustration currently -- `HeroFlow.tsx` goes right-column. 3-step section gets `ProcessDiagram.tsx` decoration above the article cards. |
| `frontend/components/ui/Card.tsx` | Card primitive -- `cardVariants({ variant })`. Must stay backward-compatible. |
| `frontend/components/ui/EmptyState.tsx` | EmptyState primitive -- accepts `icon`, `title`, `description`, `action`. Must add optional `illustration` ReactNode prop (distinct from `icon` -- illustration is larger, slotted above everything). |
| `frontend/app/doctor/page.tsx` | Doctor dashboard -- has "No visits yet" empty state. Consumer of EmptyState. |
| `frontend/app/portal/page.tsx` | Patient portal -- imports `FileText` from lucide-react. Consumer of EmptyState. |
| `frontend/components/ui/Checkbox.tsx` | Imports `Check` from lucide-react. |
| `frontend/components/ui/Dialog.tsx` | Imports `X` from lucide-react. |
| `frontend/components/ui/Select.tsx` | Imports `ChevronDown`, `Check` from lucide-react. |
| `frontend/components/ui/Toast.tsx` | Imports `X` from lucide-react. |

## Constraints & Risks

1. **LEGACY block in globals.css (lines 135-946)** is load-bearing for staff/admin pages. Zero modifications allowed inside it. New `.aurora-mesh` and other utilities must be inserted ABOVE line 135.
2. **Aurora mesh z-index** must be `-1` (behind content) and `pointer-events: none`. If it ends up above the noise-overlay or modals, the app breaks.
3. **WCAG AA contrast** on glass cards: `bg-ink-well/50` with `backdrop-blur-xl` over the aurora mesh could reduce text contrast. Every glass surface must have the semi-opaque background to guarantee 4.5:1 for body text (`#E9EEF5` on effective dark bg) and 3:1 for large text.
4. **Staff/admin isolation**: The `<AuroraMesh />` component must check `pathname` (via `usePathname`) and render `null` when the path starts with `/staff` or `/admin`. This keeps the warm-paper legacy pages untouched.
5. **Playwright selectors**: The nine selectors and happy-path spec must continue passing. Do not rename any accessible button text, ARIA labels, role attributes, or data-testid values. The hero "Sign in" and "See how it works" buttons, their `href` values, and their `role` must stay identical.
6. **5 wow moments** (animated KPI counters, agent thinking trail, signature stamp, Command-K palette, ink-bleed crossfade) must remain functional. SVG additions decorate around them -- never replace their DOM structure.
7. **lucide-react in `cmdk`**: The `cmdk` package may transitively import lucide-react. Do NOT remove the `lucide-react` package from `package.json`. Only stop importing from it in `frontend/app/**` and `frontend/components/**` files.
8. **`prefers-reduced-motion`** global kill-switch in globals.css (lines 934-946) already disables all animations. New SVG animations (path draw-on, particle loops, fade+scale) must use CSS animations or framer-motion (both caught by the kill-switch). Do NOT use `<animate>` or `<animateMotion>` SVG elements -- they bypass the CSS kill-switch. Use framer-motion's `motion.path` with `pathLength` instead.
9. **Do not modify** `lib/api.ts`, `lib/auth.ts`, `lib/agentSse.ts`, `lib/reviewReducer.ts`, `lib/types/*`.
10. **Do not touch** `app/staff/**` or `app/admin/**`.
11. **Icon replacement scope**: Only these lucide imports exist in-scope files: `FileText` (portal/page.tsx), `Check` (Checkbox.tsx, Select.tsx), `X` (Dialog.tsx, Toast.tsx), `ChevronDown` (Select.tsx). The original spec listed 14 icons -- only build the ones actually needed plus a few for the SVG illustrations. Specifically build: `Check`, `X`, `ChevronDown`, `FileText`, `Stethoscope`, `Sparkles`, `Search`, `ArrowRight`, `Globe`, `Mic`, `Clock`, `Calendar`, `Pill`, `Pulse`. If any additional lucide icons are discovered during implementation in `app/**` or `components/**`, add them to the custom set.

## Design Direction

- **Color palette**: Obsidian base `#0A0F1A` unchanged. Aurora gradient mesh overlay using cyan `#22E1D7`, violet `#8B5CF6`, magenta `#FF5C9C`, amber `#F7B23B` as large soft radial blobs at low alpha, fixed behind all content, blurred 80px. Glass-morph cards with `backdrop-blur-xl` + thin `border-ink-rim/60` + `bg-ink-well/50`.
- **Layout philosophy**: No layout changes. Same centered-column landing, same dashboard grids, same visit detail panels. Aurora mesh is purely atmospheric background. Glass variant is opt-in per card.
- **Typography**: Unchanged (Fraunces / IBM Plex Sans / JetBrains Mono).
- **Reference aesthetic**: linear.app, arc.net, vercel ship pages -- dark base with soft luminous color blobs behind glass surfaces.
- **Anti-patterns to avoid**: No full-screen gradient hero backgrounds. No neon-bright borders. No color on every surface. The aurora mesh is subtle (6-12% alpha). Glass cards are reserved for hero CTAs and key surfaces -- most cards stay `paper` variant.
- **SVG style**: Line-art with gradient strokes (cyan-to-violet-to-magenta). Thin strokes (1.5px), no fills except low-alpha washes. Animated via framer-motion only.

---

## Phases

### Phase III-1 -- Aurora Palette + Glass Primitives

**Scope:** Establish all new design tokens, Tailwind config, CSS utilities, glass card variants, aurora mesh background layer, and motion preset. This is the foundation every subsequent phase builds on.

**Steps:**

1. **Update `frontend/design/tokens.ts`**: Add three new color entries to the `colors` object:
   - `violet: "#8B5CF6"`
   - `magenta: "#FF5C9C"`
   - `auroraCyan: "#22E1D7"` (semantic alias of existing cyan)

   Add a new export `gradients` object:
   - `aurora: "linear-gradient(135deg, #22E1D7 0%, #8B5CF6 50%, #FF5C9C 100%)"`
   - `auroraSoft: "linear-gradient(135deg, rgba(34,225,215,0.2) 0%, rgba(139,92,246,0.2) 50%, rgba(255,92,156,0.2) 100%)"`

   Add to `shadows` object:
   - `glowViolet: "0 0 40px -10px rgba(139,92,246,0.4)"`
   - `glass: "0 8px 32px rgba(0,0,0,0.4)"`

2. **Update `frontend/tailwind.config.ts`**: In `theme.extend.colors`, add:
   - `violet: "#8B5CF6"`
   - `magenta: "#FF5C9C"`
   - `"aurora-cyan": "#22E1D7"`

   In `theme.extend.boxShadow`, add:
   - `glass: "0 8px 32px rgba(0,0,0,0.4)"`
   - `"glow-violet": "0 0 40px -10px rgba(139,92,246,0.4)"`
   - `"glow-aurora": "0 0 40px -10px rgba(34,225,215,0.4)"`

   In `theme.extend.backgroundImage`, add:
   - `"gradient-aurora": "linear-gradient(135deg, #22E1D7 0%, #8B5CF6 50%, #FF5C9C 100%)"`
   - `"gradient-aurora-soft": "linear-gradient(135deg, rgba(34,225,215,0.2) 0%, rgba(139,92,246,0.2) 50%, rgba(255,92,156,0.2) 100%)"`

3. **Update `frontend/design/variants.ts`**: Add two new variants to `cardVariants`:
   - `glass: "bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass"`
   - `glow: "bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60 shadow-glass shadow-glow-aurora"`

   Existing variants (`paper`, `bone`, `slate`) stay exactly as-is. Default remains `paper`.

4. **Update `frontend/design/motion.ts`**: Add new export `auroraPulse`:
   ```
   export const auroraPulse: Variants = {
     initial: { boxShadow: "0 0 20px -5px rgba(34,225,215,0.2)" },
     animate: {
       boxShadow: [
         "0 0 20px -5px rgba(34,225,215,0.2)",
         "0 0 40px -5px rgba(34,225,215,0.5)",
         "0 0 20px -5px rgba(34,225,215,0.2)",
       ],
       transition: { duration: 3, repeat: Infinity, ease: "easeInOut" },
     },
   };
   ```

5. **Update `frontend/app/globals.css`**: Insert the following ABOVE the LEGACY comment block (before line 135). Add new CSS custom properties in the `:root` block:
   - `--violet: #8B5CF6;`
   - `--magenta: #FF5C9C;`
   - `--aurora-cyan: #22E1D7;`

   Add new utility class `.aurora-mesh` after the `.shimmer-pill` reduced-motion rule (around line 133):
   ```css
   /* Aurora gradient mesh — fixed atmospheric background */
   .aurora-mesh {
     position: fixed;
     inset: 0;
     z-index: -1;
     pointer-events: none;
     overflow: hidden;
   }

   .aurora-mesh::before {
     content: "";
     position: absolute;
     inset: -20%;
     background:
       radial-gradient(ellipse 600px 600px at 15% 20%, rgba(34,225,215,0.12) 0%, transparent 70%),
       radial-gradient(ellipse 500px 500px at 85% 15%, rgba(139,92,246,0.10) 0%, transparent 70%),
       radial-gradient(ellipse 450px 450px at 10% 85%, rgba(255,92,156,0.08) 0%, transparent 70%),
       radial-gradient(ellipse 400px 400px at 80% 80%, rgba(247,178,59,0.06) 0%, transparent 70%);
     filter: blur(80px);
   }

   @supports not (filter: blur(80px)) {
     .aurora-mesh::before {
       filter: none;
       opacity: 0.5;
     }
   }
   ```

6. **Create `frontend/app/components/AuroraMesh.tsx`**: Client component (`"use client"`). Uses `usePathname()` from `next/navigation`. Returns `null` if pathname starts with `/staff` or `/admin`. Otherwise returns `<div className="aurora-mesh" aria-hidden="true" />`.

7. **Update `frontend/app/layout.tsx`**: Import `AuroraMesh` from `./components/AuroraMesh`. Add `<AuroraMesh />` as the first child inside `<body>`, before `<CommandPaletteProvider>`.

**Phase III-1 Acceptance Criteria:**
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] Tailwind classes `bg-violet`, `bg-magenta`, `bg-aurora-cyan`, `bg-gradient-aurora`, `bg-gradient-aurora-soft`, `shadow-glass`, `shadow-glow-aurora` are recognized (no "unknown utility" warnings)
- [ ] Card component accepts `variant="glass"` and `variant="glow"` without type errors
- [ ] Aurora mesh is visible as soft colored background blobs on `/`, `/login`, `/doctor`, `/portal` pages
- [ ] Aurora mesh is NOT visible on `/staff` or `/admin` pages
- [ ] Existing card variants (`paper`, `bone`, `slate`) render identically to before
- [ ] All 5 wow moments still function (Cmd+K palette, KPI counters, thinking trail, signature stamp, ink-bleed)
- [ ] `prefers-reduced-motion` disables the `auroraPulse` animation
- [ ] Playwright happy-path spec passes

---

### Phase III-2 -- Hero SVG Illustration + Process Diagram

**Scope:** Create the two landing-page SVG illustrations (hero motif and animated process diagram) and integrate them into `app/page.tsx`. These are the highest-impact visual additions for hackathon judges.

**Steps:**

1. **Create directory** `frontend/components/illustrations/` (if it does not exist).

2. **Create `frontend/components/illustrations/HeroFlow.tsx`**: Client component. Returns an SVG with `viewBox="0 0 480 480"` and fluid width/height via props or `className`. Content:
   - Three stylized circular "node" shapes arranged vertically (center-x at 240, y at ~100, 240, 380), each ~60px diameter.
   - Node 1 (pre-visit): a chat-bubble silhouette inside the circle.
   - Node 2 (visit): a stethoscope silhouette inside the circle.
   - Node 3 (post-visit): a document/summary silhouette inside the circle.
   - Two gradient paths connecting node 1->2 and node 2->3, with `stroke` using a `<linearGradient>` from cyan to violet to magenta.
   - Path stroke-width: 2px, stroke-linecap round.
   - Animation via framer-motion `motion.path` with `pathLength` animating from 0 to 1 over 1.6s ease-out on mount.
   - Each node uses `motion.g` with `initial={{ opacity: 0, scale: 0.8 }}` and `animate={{ opacity: 1, scale: 1 }}`, staggered 200ms apart, starting after path draw begins (0.3s delay for node 1, 0.5s for node 2, 0.7s for node 3).
   - 6-8 small circles (3px radius, cyan fill at 40% opacity) that drift along the paths using framer-motion's `animate` with `offset` keyframes or CSS `offset-path`. These are the "particles." They loop with `repeat: Infinity`, duration 4s.
   - `prefers-reduced-motion`: paths render at full `pathLength` instantly, nodes render at full opacity, particles are hidden. Use framer-motion's `useReducedMotion()` hook to conditionally set `animate` vs static values.
   - All elements use `currentColor` or the gradient def -- no hardcoded colors outside the gradient.
   - The gradient `<defs>` block defines `id="aurora-grad"` with stops at cyan, violet, magenta.

3. **Update `frontend/app/page.tsx` -- Hero section** (lines 116-169):
   - Import `HeroFlow` from `@/components/illustrations/HeroFlow`.
   - Change the hero `<section>` from `max-w-2xl` to `max-w-5xl`.
   - Wrap existing hero content in a two-column grid: `grid md:grid-cols-2 gap-12 items-center`.
   - Left column: the existing `motion.div` with eyebrow, h1, paragraph, buttons, and badges (unchanged content and classes).
   - Right column: `<HeroFlow className="w-full max-w-[400px] mx-auto h-auto" />` wrapped in a `motion.div` with `fadeUp` variant.
   - Verify: "Sign in" button still has `<Link href="/login">`, "See how it works" still has `<a href="#flow">`. Both are inside `<Button asChild>`. No text or role changes.

4. **Create `frontend/components/illustrations/ProcessDiagram.tsx`**: Client component. Returns an SVG with `viewBox="0 0 900 120"` (horizontal layout) or `viewBox="0 0 120 500"` (vertical for mobile).
   - Three hex/circle nodes at x=150, 450, 750 (desktop) connected by two horizontal gradient paths.
   - Each node has a small icon inside (matching the HeroFlow icons: chat, stethoscope, document).
   - Animation: `whileInView` triggers. Paths draw left-to-right via `pathLength` 0->1, 0.8s each, staggered. A "data packet" circle travels each segment (framer-motion `animate` with `x` keyframes from node-to-node, 1.5s, infinite loop with 3s pause).
   - Mobile: use a `useMediaQuery` or CSS `@media` approach. Below `md` breakpoint, render the vertical layout SVG instead. Simplest approach: render both SVGs, hide one with `className="hidden md:block"` / `"md:hidden"`.
   - `prefers-reduced-motion`: static rendering, no path draw, no traveling packets.

5. **Update `frontend/app/page.tsx` -- 3-step section** (lines 172-216):
   - Import `ProcessDiagram` from `@/components/illustrations/ProcessDiagram`.
   - Insert `<ProcessDiagram className="mb-12" />` between the `<motion.h2>` heading and the `<motion.div>` containing the three `<motion.article>` cards.
   - The three article cards stay exactly as-is (same content, same classes, same structure). The diagram is decorative above them.

**Phase III-2 Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Landing page (`/`) shows HeroFlow illustration in the right column on desktop, stacked below heading on mobile
- [ ] HeroFlow paths animate on page load (draw-on effect), nodes fade in staggered
- [ ] ProcessDiagram appears above the 3-step cards and animates when scrolled into view
- [ ] ProcessDiagram stacks vertically on mobile (< 768px)
- [ ] "Sign in" and "See how it works" buttons remain accessible with same text, href, and role
- [ ] `prefers-reduced-motion` shows all SVG content statically with no animation
- [ ] WCAG AA: all text in hero section maintains 4.5:1 contrast against the effective background
- [ ] Playwright happy-path spec passes

---

### Phase III-3 -- Empty-State Illustrations

**Scope:** Create five custom line-art SVG illustrations for empty states across the app, update the `EmptyState` primitive to accept them, and wire them into each consumer.

**Steps:**

1. **Create directory** `frontend/components/illustrations/empty/`.

2. **Create 5 illustration components**, each as a client component returning an inline SVG. All share these traits:
   - `viewBox="0 0 160 160"`, default render size via className (e.g., `w-40 h-40`)
   - Line-art style: `stroke="currentColor"` or gradient stroke using the aurora gradient def, `strokeWidth={1.5}`, `strokeLinecap="round"`, `strokeLinejoin="round"`, `fill="none"` (with optional low-alpha `rgba(34,225,215,0.05)` accent fills)
   - framer-motion `motion.svg` with `initial={{ opacity: 0, scale: 0.9 }}` and `animate={{ opacity: 1, scale: 1 }}` over 0.4s
   - Accept `{ className?: string }` prop
   - Each includes `<title>` element for accessibility

   Files and motifs:
   - **`NoVisitsIllustration.tsx`** -- Empty clipboard with a subtle plus icon, a few horizontal lines suggesting empty rows. Used for doctor dashboard "No visits yet."
   - **`NoPortalVisitsIllustration.tsx`** -- Calendar outline with empty date cells, a small clock icon. Used for patient portal "No visits."
   - **`NoMedicationsIllustration.tsx`** -- Prescription pad outline with Rx symbol, empty lines below. Used for portal visit detail empty medications.
   - **`NoReportYetIllustration.tsx`** -- Pen hovering above a blank document, a few faint dotted lines on the document. Used for ReportPanel when report is null.
   - **`NoPatientContextIllustration.tsx`** -- Branching graph/tree with 4-5 nodes, some with dashed outlines suggesting "not yet populated." Used for PatientContextPanel empty state.

3. **Update `frontend/components/ui/EmptyState.tsx`**: Add an optional `illustration` prop of type `React.ReactNode`. When provided, render it above the `icon` slot. The `illustration` div should have `className="mb-2"` to provide spacing. The existing `icon`, `title`, `description`, `action` props and their rendering stay identical.

   Updated interface:
   ```
   export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
     illustration?: React.ReactNode;
     icon?: React.ReactNode;
     title: string;
     description?: string;
     action?: React.ReactNode;
   }
   ```

4. **Update consumers** to pass the matching illustration. For each file, import the relevant illustration component and pass it as the `illustration` prop to `<EmptyState>`:

   - **`frontend/app/doctor/page.tsx`**: Find the EmptyState usage for "No visits yet". Add `illustration={<NoVisitsIllustration />}`. Import from `@/components/illustrations/empty/NoVisitsIllustration`.

   - **`frontend/app/portal/page.tsx`**: Find the EmptyState usage. Add `illustration={<NoPortalVisitsIllustration />}`. Import from `@/components/illustrations/empty/NoPortalVisitsIllustration`.

   - **`frontend/app/portal/visits/[visitId]/page.tsx`**: Find any empty-state for medications. Add `illustration={<NoMedicationsIllustration />}`. Import from `@/components/illustrations/empty/NoMedicationsIllustration`. (Note: if this file does not use `EmptyState` directly, check how empty meds are rendered and add the illustration prop to whatever empty-state pattern is used.)

   - **`frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx`**: Find the empty state when `report == null`. Add `illustration={<NoReportYetIllustration />}`. Import from `@/components/illustrations/empty/NoReportYetIllustration`.

   - **`frontend/app/doctor/components/PatientContextPanel.tsx`**: Find the empty context state. Add `illustration={<NoPatientContextIllustration />}`. Import from `@/components/illustrations/empty/NoPatientContextIllustration`. (Note: if this file does not exist at this exact path, search for `PatientContext` in `app/doctor/` to find the correct file.)

**Phase III-3 Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Each empty state in-scope shows its custom SVG illustration above the title text
- [ ] Illustrations are line-art with cyan/violet gradient strokes, consistent style
- [ ] `EmptyState` still works with only `icon`+`title` (backward compatible -- `illustration` is optional)
- [ ] All illustrations have `<title>` for screen readers
- [ ] Illustrations respect `prefers-reduced-motion` (no animation, static render)
- [ ] Playwright happy-path spec passes (empty states may or may not be visible in happy path -- confirm no regressions)

---

### Phase III-4 -- Custom Icon Set + Landing Glass Cards

**Scope:** Replace all direct lucide-react imports with a custom hand-built icon set, and apply glass card variant + glow to key landing-page surfaces for the full aurora-glass look.

**Steps:**

1. **Create `frontend/components/icons/index.tsx`**: Export 14+ icon components as named exports. Each icon:
   - Is a function component accepting `{ size?: number; className?: string }`
   - Returns an `<svg>` with `width={size ?? 24}`, `height={size ?? 24}`, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.5}`, `strokeLinecap="round"`, `strokeLinejoin="round"`
   - Inherits color via `currentColor`
   - Has slightly rounded, distinctive geometry (not identical to lucide defaults)

   Icons to build:
   - `CheckIcon` -- checkmark (replacement for lucide `Check`)
   - `XIcon` -- close/cross (replacement for lucide `X`)
   - `ChevronDownIcon` -- downward chevron (replacement for lucide `ChevronDown`)
   - `FileTextIcon` -- document with lines (replacement for lucide `FileText`)
   - `StethoscopeIcon` -- stethoscope
   - `PulseIcon` -- heartbeat/pulse line
   - `PillIcon` -- medication capsule
   - `CalendarIcon` -- calendar
   - `ClockIcon` -- clock face
   - `MicIcon` -- microphone
   - `SparklesIcon` -- sparkle stars
   - `SearchIcon` -- magnifying glass
   - `GlobeIcon` -- globe/language
   - `ArrowRightIcon` -- right arrow

2. **Replace lucide-react imports in these files** (change the import source, keep the usage identical):

   - **`frontend/components/ui/Checkbox.tsx`** (line 5): Replace `import { Check } from "lucide-react"` with `import { CheckIcon as Check } from "@/components/icons"`.

   - **`frontend/components/ui/Dialog.tsx`** (line 5): Replace `import { X } from "lucide-react"` with `import { XIcon as X } from "@/components/icons"`.

   - **`frontend/components/ui/Select.tsx`** (line 5): Replace `import { ChevronDown, Check } from "lucide-react"` with `import { ChevronDownIcon as ChevronDown, CheckIcon as Check } from "@/components/icons"`.

   - **`frontend/components/ui/Toast.tsx`** (line 5): Replace `import { X } from "lucide-react"` with `import { XIcon as X } from "@/components/icons"`.

   - **`frontend/app/portal/page.tsx`** (line 7): Replace `import { FileText } from "lucide-react"` with `import { FileTextIcon as FileText } from "@/components/icons"`.

   - **Run a final grep** across `frontend/app/**` and `frontend/components/**` for any remaining `from "lucide-react"` imports that were missed. Replace each one using the matching custom icon. Do NOT touch files outside these directories.

3. **Apply glass card variant to landing page hero CTA area**: In `frontend/app/page.tsx`, the badge row (lines 156-167 -- the "Private by design" / "Doctor-reviewed" / "Bilingual summaries" spans) -- wrap them in a glass-variant container or apply `bg-ink-well/30 backdrop-blur-md border border-ink-rim/40 rounded-sm px-4 py-3` to the wrapper div for a subtle glass effect. Keep the text and classes on individual spans unchanged.

4. **Apply glow variant to hero "Sign in" button**: In `frontend/app/page.tsx`, add `auroraPulse` motion animation to the Sign-in button wrapper. Wrap the `<Button asChild size="lg" variant="primary">` in a `<motion.div variants={auroraPulse} initial="initial" animate="animate">`. Import `auroraPulse` from `@/design/motion`. This adds the breathing glow halo. The button text, href, and role stay identical.

**Phase III-4 Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Zero `from "lucide-react"` imports remain in `frontend/app/**` or `frontend/components/**` (except possibly in node_modules or cmdk internals)
- [ ] All icons render identically in size and position to their lucide predecessors (24x24, currentColor)
- [ ] Checkbox check, Dialog close button, Select dropdown arrow, Toast close button all still function correctly
- [ ] Hero Sign-in button has a breathing cyan glow halo
- [ ] `prefers-reduced-motion` disables the glow pulse
- [ ] The `lucide-react` package is NOT removed from `package.json`
- [ ] Playwright happy-path spec passes

---

### Phase III-5 -- Final Integration + Glass Polish

**Scope:** Apply glass card treatment to key surfaces across doctor and portal pages, run full evaluator checks, confirm WCAG AA, and verify all prior phases hold together.

**Steps:**

1. **Apply glass variant to select doctor dashboard cards**: In `frontend/app/doctor/page.tsx`, identify the primary KPI cards or summary cards and change their variant from `paper` to `glass`. Only change 2-3 prominent cards -- leave most as `paper` for contrast.

2. **Apply glass variant to portal visit cards**: In `frontend/app/portal/page.tsx` or the VisitCard component, consider applying `glass` variant to visit cards in the portal. If VisitCard does not use the `Card` component, add `bg-ink-well/50 backdrop-blur-xl border border-ink-rim/60` classes directly.

3. **Verify WCAG AA contrast on all glass surfaces**: For every text-on-glass surface, verify that the effective background (semi-transparent ink-well over aurora mesh) produces at least 4.5:1 contrast ratio with `#E9EEF5` (fog) text. The `bg-ink-well/50` (which is `rgba(14,20,36,0.5)`) over the darkest aurora blob (cyan at 12% alpha over obsidian) produces an effective background of approximately `#0B1120` -- fog text against this is ~13:1, well above AA. But verify edge cases where the aurora blob is brightest.

4. **Add gradient text treatment to landing page heading**: In `app/page.tsx`, the hero `<em>` tag (currently `text-cyan`) -- change to a gradient text effect: `bg-gradient-aurora bg-clip-text text-transparent`. This makes "Fewer on paperwork." shimmer in the aurora gradient instead of flat cyan. If WCAG contrast is a concern (gradient text is decorative and the semantic meaning is conveyed by the preceding text), this is acceptable.

5. **Run full verification**:
   - `npm run typecheck`
   - `npm run build`
   - `npm run lint`
   - Playwright happy-path spec
   - Visual audit of: `/`, `/login`, `/portal`, `/portal/visits/[id]`, `/doctor`, `/doctor/queue`, `/doctor/finalized`, `/doctor/visits/[id]`, `/staff`, `/admin`
   - Confirm aurora-glass is visible on in-scope pages, NOT visible on staff/admin
   - Confirm all 5 wow moments still fire
   - `git diff master -- frontend/lib/` should show zero changes (no contract drift)

**Phase III-5 Acceptance Criteria:**
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes (or only pre-existing warnings)
- [ ] Playwright happy-path spec passes
- [ ] Aurora mesh visible on `/`, `/login`, `/portal`, `/doctor` pages
- [ ] Aurora mesh NOT visible on `/staff`, `/admin` pages
- [ ] Glass cards visible on doctor dashboard and portal
- [ ] Hero gradient text renders correctly
- [ ] All 5 wow moments function (Cmd+K, KPI count-up, thinking trail, signature stamp, ink-bleed)
- [ ] WCAG AA contrast holds on all text-on-glass surfaces (4.5:1 minimum)
- [ ] `git diff master -- frontend/lib/` shows zero changes
- [ ] No `from "lucide-react"` imports in `frontend/app/**` or `frontend/components/**`

---

## Overall Acceptance Criteria

- Aurora gradient mesh is the ambient background on all non-staff/non-admin pages
- Glass-morph cards (`glass` and `glow` variants) are available and used on key surfaces
- Hero illustration (HeroFlow) renders on landing page with animated path draw-on
- Process diagram renders above the 3-step cards with viewport-triggered animation
- 5 custom empty-state illustrations are wired into their respective consumers
- 14 custom icons replace all direct lucide-react imports in app/components code
- Hero CTA has breathing aurora glow
- Hero heading uses aurora gradient text
- All 5 wow moments preserved and functional
- `prefers-reduced-motion` disables all new animations
- WCAG AA contrast maintained everywhere
- Staff and admin pages completely unchanged
- `lib/api.ts`, `lib/auth.ts`, `lib/agentSse.ts`, `lib/reviewReducer.ts`, `lib/types/*` untouched
- Playwright happy-path spec passes
- Zero TypeScript errors, build succeeds

## Evaluation Rubric

- **Functionality** (weight 0.3): All aurora-glass visual effects render correctly. Glass cards, aurora mesh, SVG illustrations, and custom icons all work. No runtime errors. All 5 wow moments preserved. Staff/admin pages untouched.
- **Craft** (weight 0.3): SVG illustrations are well-crafted line-art (not crude shapes). Animations are smooth and purposeful. Glass-morph effect looks polished. `prefers-reduced-motion` respected everywhere. No accessibility regressions. Custom icons match the visual weight and style of their lucide predecessors.
- **Design** (weight 0.2): Aurora-glass aesthetic is cohesive and evokes linear.app/arc.net quality. Color blobs are subtle (not garish). Glass cards have depth without clutter. Gradient text is tasteful. The overall impression is "premium dark UI" not "neon rave."
- **Completeness** (weight 0.2): All acceptance criteria met across all 5 phases. No missing illustrations, no leftover lucide imports, no unapplied glass variants on specified surfaces. Typecheck, build, lint, and Playwright all pass.
