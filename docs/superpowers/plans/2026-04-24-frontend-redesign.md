# Frontend Redesign Plan — "Clinical Editorial"

## Goal

Replace the current Claude.ai-inspired frontend theme with a "Clinical Editorial" aesthetic (New England Journal of Medicine meets modernist art direction) across all non-staff/admin pages, using Tailwind CSS utility classes + cva in `.tsx` files, preserving all Playwright selectors and API contracts.

## Context

| File / Pattern | Why It Matters |
|---|---|
| `frontend/app/layout.tsx` | Root layout — font imports (Fraunces + Outfit), AppHeader render. Outfit will be replaced by IBM Plex Sans; JetBrains Mono added. |
| `frontend/app/globals.css` | 44k-line CSS file defining ALL current styles. Will be replaced with a minimal file: Tailwind directives + CSS variables + legacy class block for staff/admin. |
| `frontend/package.json` | Currently has zero Tailwind/cva/framer-motion deps. All must be added. |
| `frontend/app/staff/**` | 4 pages + 1 nav component using legacy CSS classes. Must NOT be modified; their classes must be preserved in globals.css. |
| `frontend/app/admin/**` | 4 pages + 1 nav component using legacy CSS classes. Must NOT be modified; their classes must be preserved in globals.css. |
| `frontend/lib/api.ts`, `frontend/lib/agentSse.ts`, `frontend/lib/auth.ts`, `frontend/lib/reviewReducer.ts` | API contracts and state machines. Must NOT be modified. |
| `frontend/e2e/*.spec.ts` | Playwright specs with selector contracts that must be preserved verbatim. |

## Constraints & Risks

- **Legacy class survival**: Staff and admin pages use CSS classes defined in the current `globals.css`. The new `globals.css` must include all of those classes verbatim under a `/* LEGACY */` section. Omitting any will silently break those pages.
- **Playwright selectors**: Nine explicit selector contracts (listed below) must survive. Any rename or restructure that breaks them fails acceptance.
- **API contracts**: Zero changes to `lib/api.ts`, `lib/agentSse.ts`, `lib/auth.ts`, `lib/reviewReducer.ts`. The reducer state machine and multipart audio POST must be untouched.
- **Doctor-in-the-loop invariant**: AI draft vs. signed visual distinction must be maintained (oxblood left-border + "AI DRAFT" badge vs. plain card + sage "Signed" badge).
- **No Tailwind config currently exists**: Must create `tailwind.config.ts` and `postcss.config.js` from scratch. The Next.js 14 build must pick them up correctly.
- **`prefers-reduced-motion`**: framer-motion respects this by default; do not override.
- **next/font/google with `preload: false`**: All three fonts use `preload: false` to avoid Google Fonts blocking render.

## Design Direction

- **Color palette**: Warm paper/bone backgrounds (`#F6F1E6`/`#E8DFCE`), ink-dark text (`#141414`), oxblood accent (`#7A2E2E`), sage for success (`#4F6B56`), ochre for warnings (`#B87C2A`), crimson for errors (`#8F1C1C`), slate for doctor dark panels (`#1F2A2B`).
- **Layout philosophy**: Editorial magazine — generous whitespace, Fraunces display type at scale, hairline dividers, no gradients, no purple, no rounded cards beyond `radius.sm` (4px) except chat bubbles (8px). Doctor surfaces use slate dark backgrounds for data-dense panels.
- **Typography**: Fraunces (display/headings), IBM Plex Sans (body), JetBrains Mono (IDs, vitals, dosages, code).
- **Anti-patterns to avoid**: No gradient hero sections, no purple/violet anywhere, no Inter/Outfit font remnants, no card grids with generic icons, no rounded-lg or rounded-xl (max `rounded-sm` = 4px, except chat bubbles at `rounded-md` = 8px), no hover micro-animations beyond opacity/color transition (150ms ease).

## Non-Negotiable Playwright Selector Preservation

Every generator phase must preserve these selectors verbatim:

1. `getByLabel("Consultation transcript")` — keep `<textarea aria-label="Consultation transcript">`
2. `getByRole("button", { name: /generate report/i })` — button text "Generate report"
3. `getByRole("tab", { name: /consultation/i })` — tab label "Consultation"
4. `getByPlaceholder(/answer:/i)` — input placeholder containing "answer:"
5. `getByText(/bronchitis/i)` — report content must render diagnosis text
6. `getByRole("button", { name: /approve & continue/i })` — button text "Approve & continue"
7. `getByRole("button", { name: /publish to patient/i })` — button text "Publish to patient"
8. `getByText(/published/i)` — published state indicator containing "Published"
9. `getByLabel("Email")`, `getByLabel("Password")`, `getByRole("button", { name: /sign in/i })` — login form

## Legacy CSS Classes to Preserve in globals.css

Collected from `frontend/app/staff/**` and `frontend/app/admin/**` (these pages will NOT be rewritten):

### Shell & Layout
- `shell`, `shell-narrow`, `portal-shell`, `staff-shell`

### Page Header
- `page-header`, `page-header-eyebrow`, `page-header-title`, `page-header-sub`

### Banners
- `ghost-banner`, `banner`, `banner-error`

### Buttons & Inputs
- `btn`, `btn-primary`, `btn-sm`
- `input`, `input-compact`
- `field`, `field-label`

### Empty State
- `empty-state`, `empty-state-glyph`, `empty-state-title`, `empty-state-body`

### Skeleton
- `skeleton-row`, `skeleton-bar`, `skeleton-bar-wide`, `skeleton-bar-narrow`, `skeleton-bar-btn`

### Staff-Specific
- `staff-nav`, `staff-nav-inner`, `staff-nav-brand`, `staff-nav-tabs`, `staff-nav-tab`, `staff-nav-tab-active`
- `waiting-list`, `waiting-row`, `waiting-dot`, `waiting-dot-pending`, `waiting-dot-submitted`, `waiting-dot-none`, `waiting-name`, `waiting-meta`, `waiting-action`, `waiting-hint`, `waiting-error`
- `staff-search`
- `patient-list`, `patient-row`, `patient-name`, `patient-meta`, `patient-meta-right`
- `staff-card`, `staff-card-title`, `staff-card-empty`
- `staff-dl`
- `visit-list`, `visit-item`, `visit-item-date`, `visit-item-preview`
- `readonly-caption`

### Admin-Specific
- `admin-nav`, `admin-nav-inner`, `admin-nav-brand`, `admin-nav-tabs`, `admin-nav-tab`, `admin-nav-tab-active`
- `admin-cards`, `admin-card`, `admin-card-icon`, `admin-card-title`, `admin-card-body`
- `admin-section-header`, `admin-section-title`
- `admin-create-panel`, `admin-create-title`, `admin-create-form`
- `admin-table-wrap`
- `audit-table`
- `audit-filters`, `audit-filter-field`, `audit-filter-btn`
- `audit-pagination`, `audit-page-info`
- `role-chip`, `role-chip-patient`, `role-chip-doctor`, `role-chip-staff`, `role-chip-admin`
- `role-change-row`
- `stub-hint`, `error-hint`

### KPI (Analytics)
- `kpi-grid`, `kpi-card`, `kpi-value`, `kpi-label`

---

## Phase 0 — Preflight (generator reads, no code changes)

**Scope:** Verify branch state and read all files needed to understand existing component APIs before writing code.

**Steps:**

1. Run `git status` on the working branch. Confirm no uncommitted changes to in-scope files (untracked PNGs and test results are fine to ignore).

2. Read these files to understand current component structure and props:
   - `frontend/app/layout.tsx`
   - `frontend/app/page.tsx`
   - `frontend/app/login/page.tsx`
   - `frontend/app/privacy/page.tsx`
   - `frontend/app/previsit/layout.tsx`
   - `frontend/app/previsit/new/page.tsx`
   - `frontend/app/portal/layout.tsx`
   - `frontend/app/portal/page.tsx`
   - `frontend/app/portal/visits/[visitId]/page.tsx`
   - `frontend/app/portal/components/VisitCard.tsx`
   - `frontend/app/portal/components/MedicationCard.tsx`
   - `frontend/app/portal/components/FollowUpCard.tsx`
   - `frontend/app/portal/components/RedFlagsCard.tsx`
   - `frontend/app/doctor/page.tsx`
   - `frontend/app/doctor/queue/page.tsx`
   - `frontend/app/doctor/finalized/page.tsx`
   - `frontend/app/doctor/visits/[visitId]/page.tsx`
   - `frontend/app/doctor/components/PatientContextPanel.tsx`
   - `frontend/app/doctor/components/PhaseTabs.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx`
   - `frontend/app/doctor/visits/[visitId]/components/review/review.css`
   - `frontend/app/components/AppHeader.tsx`
   - `frontend/app/components/PageHeader.tsx`
   - `frontend/app/components/PortalNav.tsx`
   - `frontend/app/components/ConsentGate.tsx`
   - `frontend/lib/api.ts`
   - `frontend/lib/agentSse.ts`
   - `frontend/lib/auth.ts`
   - `frontend/lib/reviewReducer.ts`

3. Confirm the dependency list that will be installed (see Phase 1 Step 1). No surprises.

**Phase 0 Acceptance Criteria:**
- [ ] Generator has read all listed files and understands existing component props, state machines, and rendering logic
- [ ] No uncommitted changes to in-scope source files

---

## Phase 1 — Design System Scaffold

**Scope:** Install all dependencies, create the design token system, cva variant factories, motion presets, utility helpers, Tailwind/PostCSS config, rewrite `globals.css` (preserving legacy classes), update `layout.tsx` fonts, and build all `components/ui/*` primitives. No page rewrites in this phase.

**Steps:**

1. **Install dependencies** in `frontend/`:
   - Production: `tailwindcss@^3.4.0 tailwind-merge@^2.5.0 class-variance-authority@^0.7.0 clsx@^2.1.1 framer-motion@^11.0.0 lucide-react@^0.454.0 @radix-ui/react-dialog@^1.1.0 @radix-ui/react-tabs@^1.1.0 @radix-ui/react-toast@^1.2.0 @radix-ui/react-tooltip@^1.1.0 @radix-ui/react-select@^2.1.0 @radix-ui/react-checkbox@^1.1.0 @radix-ui/react-popover@^1.1.0 @radix-ui/react-slot@^1.1.0`
   - Dev: `postcss@^8.4.0 autoprefixer@^10.4.0`
   - Command: `cd frontend && npm install <prod deps> && npm install -D <dev deps>`

2. **Create `frontend/tailwind.config.ts`**:
   - `content`: `["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./design/**/*.{ts,tsx}"]`
   - `theme.extend.colors`: `paper: '#F6F1E6'`, `bone: '#E8DFCE'`, `ink: '#141414'`, `'ink-soft': '#3B3A35'`, `oxblood: '#7A2E2E'`, `sage: '#4F6B56'`, `ochre: '#B87C2A'`, `crimson: '#8F1C1C'`, `slate: '#1F2A2B'`, `hairline: '#D9D1BE'`. Semantic aliases: `primary: '#7A2E2E'` (oxblood), `success: '#4F6B56'` (sage), `warning: '#B87C2A'` (ochre), `danger: '#8F1C1C'` (crimson).
   - `theme.extend.fontFamily`: `display: ['var(--font-display)']`, `sans: ['var(--font-body)']`, `mono: ['var(--font-mono)']`
   - `theme.extend.borderRadius`: `xs: '2px'`, `sm: '4px'`, `md: '8px'`
   - `plugins: []`

3. **Create `frontend/postcss.config.js`**:
   - Standard: `{ plugins: { tailwindcss: {}, autoprefixer: {} } }`

4. **Create `frontend/design/tokens.ts`**:
   - Export `colors` object matching the palette above.
   - Export `fonts = { display: 'var(--font-display)', body: 'var(--font-body)', mono: 'var(--font-mono)' }`.
   - Export `radii = { xs: '2px', sm: '4px', md: '8px' }`.
   - Export `shadows = { card: '0 1px 3px rgba(0,0,0,0.06)', elevated: '0 4px 12px rgba(0,0,0,0.08)' }`.
   - Export `spacing = { section: '3rem', content: '1.5rem', tight: '0.75rem' }`.
   - Export `motion = { duration: { fast: 0.15, normal: 0.3, slow: 0.5 }, easing: { ease: [0.25, 0.1, 0.25, 1] } }`.

5. **Create `frontend/design/cn.ts`**:
   ```ts
   import { clsx, type ClassValue } from "clsx";
   import { twMerge } from "tailwind-merge";
   export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
   ```

6. **Create `frontend/design/motion.ts`**:
   - Export framer-motion `Variants` objects:
     - `fadeUp`: initial `{ opacity: 0, y: 12 }`, animate `{ opacity: 1, y: 0 }`, transition `{ duration: 0.3, ease: [0.25,0.1,0.25,1] }`.
     - `staggerChildren`: parent variant with `staggerChildren: 0.07` (70ms).
     - `revealEditorial`: initial `{ opacity: 0, x: -8 }`, animate `{ opacity: 1, x: 0 }`, transition `{ duration: 0.4 }`.
     - `slideInRight`: initial `{ opacity: 0, x: 20 }`, animate `{ opacity: 1, x: 0 }`, transition `{ duration: 0.3 }`.

7. **Create `frontend/design/variants.ts`**:
   - cva variant factories for every primitive component (detailed per-component below in step 8). Each factory exported as a named export (`buttonVariants`, `cardVariants`, `badgeVariants`, `inputVariants`, etc.).

8. **Create `frontend/components/ui/` directory** with these primitives:

   **`Button.tsx`** (`"use client"`):
   - Props: `variant: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link'` (default `'primary'`); `size: 'sm' | 'md' | 'lg'` (default `'md'`); `loading?: boolean`; `icon?: React.ReactNode`; `asChild?: boolean` (via Radix Slot). Standard `ButtonHTMLAttributes`.
   - Primary: `bg-oxblood text-paper hover:bg-oxblood/90`, sm=`h-8 px-3 text-sm`, md=`h-10 px-5 text-sm`, lg=`h-12 px-8 text-base`.
   - Secondary: `border border-hairline bg-paper text-ink hover:bg-bone`.
   - Ghost: `text-ink-soft hover:bg-bone/50`.
   - Destructive: `bg-crimson text-paper hover:bg-crimson/90`.
   - Link: `text-oxblood underline-offset-4 hover:underline`.
   - All: `transition-colors duration-150 ease-out rounded-sm font-sans inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none`.
   - When `loading`, show a small spinner SVG and disable the button.

   **`IconButton.tsx`** (`"use client"`):
   - Wraps `Button` with `size` mapped to square dimensions, `variant` defaults to `'ghost'`, renders only `icon` child.
   - Sizes: sm=`h-8 w-8`, md=`h-10 w-10`, lg=`h-12 w-12`.

   **`Card.tsx`**:
   - Props: `variant: 'paper' | 'slate' | 'bone'` (default `'paper'`); `className?: string`; `children`.
   - Paper: `bg-paper border border-hairline`.
   - Slate: `bg-slate text-paper border border-slate`.
   - Bone: `bg-bone border border-hairline`.
   - All: `rounded-sm p-6`.
   - Exports sub-component `CardHeader` (flex row with title + optional action).

   **`Input.tsx`** (`"use client"`):
   - Wraps `<input>` with: `h-10 w-full rounded-sm border border-hairline bg-paper px-3 text-sm font-sans text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-1 focus:ring-oxblood/40 disabled:opacity-50`.
   - Forwards ref.

   **`Textarea.tsx`** (`"use client"`):
   - Same styling as Input but for `<textarea>`, with `min-h-[80px] resize-y`.
   - Forwards ref.

   **`Select.tsx`** (`"use client"`):
   - Radix Select primitive with trigger styled like Input, content panel `bg-paper border border-hairline rounded-sm shadow-card`.

   **`Checkbox.tsx`** (`"use client"`):
   - Radix Checkbox. Unchecked: `border border-hairline`. Checked: `bg-oxblood border-oxblood` with white checkmark. Size `h-4 w-4 rounded-xs`.

   **`Label.tsx`**:
   - `text-sm font-medium text-ink-soft font-sans`.

   **`Field.tsx`**:
   - Wrapper: renders `Label`, child input, optional `hint` (muted small text), optional `error` (crimson small text). Vertical stack with `gap-1.5`.

   **`Badge.tsx`**:
   - Props: `variant: 'neutral' | 'primary' | 'good' | 'warn' | 'danger' | 'draft' | 'review' | 'published'` (default `'neutral'`).
   - All: `inline-flex items-center rounded-xs px-2 py-0.5 text-xs font-medium font-sans uppercase tracking-wider`.
   - Neutral: `bg-bone text-ink-soft`. Primary: `bg-oxblood/10 text-oxblood`. Good/Published: `bg-sage/10 text-sage`. Warn/Review: `bg-ochre/10 text-ochre`. Danger/Draft: `bg-crimson/10 text-crimson` for danger, `bg-oxblood/10 text-oxblood border-l-2 border-oxblood` for draft.

   **`Tabs.tsx`** (`"use client"`):
   - Wraps Radix Tabs. `TabsList`: `flex gap-0 border-b border-hairline`. `TabsTrigger`: `px-4 py-2 text-sm font-sans text-ink-soft data-[state=active]:text-oxblood data-[state=active]:border-b-2 data-[state=active]:border-oxblood transition-colors`. `TabsContent`: `pt-4`.
   - Must produce `role="tab"` with readable accessible names (Radix does this by default).

   **`Dialog.tsx`** (`"use client"`):
   - Radix Dialog. Overlay: `fixed inset-0 bg-ink/40 backdrop-blur-sm`. Content: `bg-paper border border-hairline rounded-sm p-6 shadow-elevated max-w-lg mx-auto mt-[20vh]`. Close button in top-right via `X` icon from lucide-react.

   **`Tooltip.tsx`** (`"use client"`):
   - Radix Tooltip. Content: `bg-slate text-paper text-xs px-2 py-1 rounded-xs shadow-card font-sans`.

   **`Toast.tsx`** + **`useToast.ts`** (`"use client"`):
   - Radix Toast. Viewport fixed bottom-right. Toast item: `bg-paper border border-hairline rounded-sm p-4 shadow-elevated`. Variants for success (sage left border), error (crimson left border), info (oxblood left border).
   - `useToast` hook: manages toast state, returns `{ toast, dismiss }`.

   **`Separator.tsx`**:
   - `<hr>` styled as `border-t border-hairline my-4`. Props: `className`, `orientation: 'horizontal' | 'vertical'`.

   **`DataRow.tsx`**:
   - Props: `label: string`, `value: string | React.ReactNode`, `mono?: boolean`.
   - Renders: flex row, label left in `text-sm text-ink-soft font-sans`, value right in `text-sm text-ink` + `font-mono` if `mono`.

   **`SectionHeader.tsx`**:
   - Props: `number?: string` (e.g. `"01"`), `title: string`, `action?: React.ReactNode`.
   - Renders: `<div>` flex row. Number in `font-mono text-xs text-ink-soft/60 tracking-widest`, then `" --- "` hairline, then title in `text-sm font-medium uppercase tracking-wider text-ink`. Action slot right-aligned.

   **`PullQuote.tsx`**:
   - Props: `children: React.ReactNode`.
   - Renders: `<blockquote>` with `font-display text-xl leading-relaxed text-ink border-l-2 border-oxblood pl-6 my-6`.

   **`StatTile.tsx`**:
   - Props: `label: string`, `value: string | number`, `icon?: React.ReactNode`.
   - Renders: `Card variant="bone"` containing value in `font-display text-2xl text-ink`, label in `text-xs text-ink-soft uppercase tracking-wider mt-1`.

   **`EmptyState.tsx`**:
   - Props: `icon?: React.ReactNode`, `title: string`, `description?: string`, `action?: React.ReactNode`.
   - Renders: centered flex column with icon (lucide, 40px, `text-ink-soft/40`), title in `font-sans text-base text-ink`, description in `text-sm text-ink-soft`, optional action button.

   **`Skeleton.tsx`**:
   - Props: `className?: string`.
   - Renders: `<div>` with `animate-pulse bg-bone/60 rounded-xs` + className.

   **`PhasedSpinner.tsx`** (`"use client"`):
   - Port the existing phased spinner logic. Same props interface. Restyle: use `text-oxblood` for the active spinner, `text-ink-soft` for phase labels, `font-mono text-xs` for phase names.

   **`Kbd.tsx`**:
   - Props: `children: string`.
   - Renders: `<kbd>` with `inline-flex items-center rounded-xs border border-hairline bg-bone px-1.5 py-0.5 text-xs font-mono text-ink-soft`.

   **`AppShell.tsx`** (`"use client"`):
   - Props: `variant: 'paper' | 'slate'` (default `'paper'`), `children`.
   - Paper: `min-h-screen bg-paper text-ink font-sans`.
   - Slate: `min-h-screen bg-slate text-paper font-sans`.
   - Wraps `children` in a `<div>` with the variant classes.

9. **Rewrite `frontend/app/globals.css`**:
   - Line 1-3: Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`)
   - Lines 5-30: `@layer base` with CSS custom properties on `:root`: `--paper`, `--bone`, `--ink`, `--ink-soft`, `--oxblood`, `--sage`, `--ochre`, `--crimson`, `--slate`, `--hairline`, `--font-display`, `--font-body`, `--font-mono`. Set `body { @apply bg-paper text-ink font-sans antialiased; }`.
   - Lines 32+: `/* LEGACY -- staff + admin classes. DO NOT REMOVE until those pages are rewritten. */` followed by ALL classes listed in the "Legacy CSS Classes to Preserve" section above, extracted from the current `globals.css`. The generator must grep the current `globals.css` for each class name and copy its rule block verbatim into this section. If a legacy class references a CSS variable that no longer exists under the new names, add a compatibility alias (e.g., if legacy uses `var(--primary)`, add `--primary: var(--oxblood)`).

10. **Update `frontend/app/layout.tsx`**:
    - Replace `Outfit` import with `IBM_Plex_Sans` from `next/font/google`.
    - Add `JetBrains_Mono` from `next/font/google`.
    - Configure: `IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap', preload: false, weight: ['400', '500', '600'] })`.
    - Configure: `JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap', preload: false })`.
    - Keep `Fraunces` as-is (already has `--font-display`).
    - Update `<html>` className to include all three variables: `${fraunces.variable} ${ibmPlexSans.variable} ${jetBrainsMono.variable}`.
    - Keep `<AppHeader />` render and `{children}` — no structural changes to layout beyond fonts.

**Verification:**
```bash
cd frontend && npm install && npm run typecheck && npm run build
```
Build must succeed. Staff and admin pages must render without broken styles (legacy classes preserved).

**Phase 1 Acceptance Criteria:**
- [ ] All dependencies installed successfully
- [ ] `tailwind.config.ts` and `postcss.config.js` exist and are valid
- [ ] `design/tokens.ts`, `design/cn.ts`, `design/motion.ts`, `design/variants.ts` exist and export correctly
- [ ] All 23 `components/ui/*` primitives exist, export correctly, and pass typecheck
- [ ] `globals.css` contains Tailwind directives, CSS variables, and the full legacy class block
- [ ] `layout.tsx` loads Fraunces, IBM Plex Sans, JetBrains Mono with correct CSS variables
- [ ] `npm run build` succeeds
- [ ] Opening `/staff` and `/admin` in dev shows pages rendering with correct legacy styles

---

## Phase 2 — Shared Shell + Marketing + Auth Pages

**Scope:** Rewrite `AppHeader`, landing page (`/`), login page (`/login`), and privacy page (`/privacy`) using the new design system primitives. These are the first pages users see.

**Steps:**

1. **Rewrite `frontend/app/components/AppHeader.tsx`**:
   - Sticky top nav: `fixed top-0 w-full z-50 bg-paper/95 backdrop-blur-sm border-b border-hairline`.
   - Left: CliniFlow wordmark in `font-display text-lg text-ink`. No leaf/logo SVG — just the wordmark.
   - Right: nav links in `font-sans text-sm text-ink-soft hover:text-oxblood transition-colors duration-150`. Links: conditionally render based on auth state (login/logout).
   - Height: `h-14`.
   - Add `pt-14` spacer to body content (or use a spacer div after the header).

2. **Rewrite `frontend/app/page.tsx`** (landing `/`):
   - Composition: single-column centered layout, max-width `max-w-2xl mx-auto px-6`.
   - Hero: Fraunces display heading at `text-4xl md:text-5xl font-display text-ink leading-tight`, e.g. "Clinical workflows, intelligently assisted." No gradient, no purple, no hero image.
   - Subhead: `text-lg text-ink-soft font-sans leading-relaxed mt-4`.
   - Single CTA button: `Button variant="primary" size="lg"` — "Sign in" linking to `/login`.
   - Below: three editorial feature lines (not cards) — each is a `SectionHeader` + one-line description. Stagger reveal via `motion.staggerChildren` + `motion.fadeUp`.
   - Footer: simple `text-xs text-ink-soft` with copyright and link to `/privacy`.
   - Motion: one `staggerChildren` container wrapping the hero + feature lines, 70ms stagger.

3. **Rewrite `frontend/app/login/page.tsx`**:
   - Centered card: `max-w-sm mx-auto mt-24`.
   - Heading: `font-display text-2xl text-ink` — "Sign in".
   - Form fields using `Field` + `Input` primitives:
     - Email field: `<label>` text "Email" (preserves `getByLabel("Email")`), `<Input type="email">`.
     - Password field: `<label>` text "Password" (preserves `getByLabel("Password")`), `<Input type="password">`.
   - Submit button: `Button variant="primary"` with text "Sign in" (preserves `getByRole("button", { name: /sign in/i })`).
   - Error display: `text-sm text-crimson mt-2`.
   - Demo credentials hint below the form (if present in current code, preserve the same text/structure).
   - **CRITICAL**: Do not change the `onSubmit` handler logic, auth flow, or state management. Only restyle.

4. **Rewrite `frontend/app/privacy/page.tsx`**:
   - Editorial layout: `max-w-2xl mx-auto px-6 py-12`.
   - Title: `font-display text-3xl text-ink` — preserve exact heading text.
   - Body: `prose` styled with `font-sans text-base text-ink-soft leading-relaxed` and `Separator` between sections.
   - Do not change any legal text content.

**Verification:**
```bash
cd frontend && npm run dev
# Manual check: open /, /login, /privacy
# Confirm: Fraunces headings visible, oxblood accent on CTA, no purple, no gradient, hairline dividers, IBM Plex Sans body text
```

**Phase 2 Acceptance Criteria:**
- [ ] `AppHeader` renders with wordmark, nav links, sticky positioning, hairline bottom border
- [ ] Landing page (`/`) has editorial layout with Fraunces heading, single oxblood CTA, stagger animation
- [ ] Login page has centered form with `Email` and `Password` labels, "Sign in" button (all Playwright selectors preserved)
- [ ] Privacy page renders with editorial typography
- [ ] No purple, no gradient, no Inter/Outfit font visible
- [ ] `npm run build` succeeds

---

## Phase 3 — Patient Surfaces

**Scope:** Rewrite pre-visit intake and patient portal pages using the new design system. Warm paper/bone aesthetic with serif pull-quotes and accessible chat bubbles.

**Steps:**

1. **Rewrite `frontend/app/previsit/layout.tsx`**:
   - Wrap children in `AppShell variant="paper"`.
   - Simple layout container: `max-w-2xl mx-auto px-6 py-8`.

2. **Rewrite `frontend/app/previsit/new/page.tsx`**:
   - Preserve all existing state management, chat logic, step progression, and API calls.
   - Restyle chat interface:
     - Patient messages: `Card variant="bone"` with `rounded-md` (8px), right-aligned.
     - Bot messages: `Card variant="paper"` with `rounded-md`, left-aligned, with subtle `border-l-2 border-oxblood`.
     - Input area: `Input` primitive at bottom, with send button using `IconButton`.
   - Step progress indicator: horizontal dots/steps using `font-mono text-xs` for step labels.
   - Stagger reveal on initial chat load.

3. **Rewrite `frontend/app/portal/layout.tsx`**:
   - Wrap in `AppShell variant="paper"`.
   - Include portal nav (rewritten below).

4. **Rewrite `frontend/app/components/PortalNav.tsx`**:
   - Sticky sub-nav below AppHeader: `bg-bone/50 border-b border-hairline`.
   - Patient name + "Portal" label on left.
   - Nav links (if any) on right.

5. **Rewrite `frontend/app/portal/page.tsx`**:
   - Visit list rendering using `Card variant="paper"` for each visit.
   - Visit card shows: date, doctor name, status badge (`Badge variant="published"` or `Badge variant="review"`).
   - Empty state using `EmptyState` primitive.
   - Stagger reveal on visit list.

6. **Rewrite `frontend/app/portal/visits/[visitId]/page.tsx`**:
   - Preserve bilingual Radix Tabs (EN/MS) — use the new `Tabs` primitive, keeping tab labels identical.
   - Summary body: use `PullQuote` for the AI-generated summary text.
   - Medication list: use `DataRow` with `mono` for dosages.
   - Follow-up card: `Card variant="bone"` with follow-up date and instructions.
   - Red flags card: `Card variant="paper"` with `border-l-2 border-crimson` left accent and crimson text for flags.
   - Signing doctor attribution: `text-xs text-ink-soft font-mono`.
   - Reduced motion: framer-motion handles this by default (90ms fade fallback).

7. **Rewrite portal sub-components**:
   - `frontend/app/portal/components/VisitCard.tsx` — `Card variant="paper"`, date in `font-mono text-xs`, status `Badge`.
   - `frontend/app/portal/components/MedicationCard.tsx` — `Card variant="bone"`, medication name `font-sans font-medium`, dosage `font-mono text-sm`, empty state with `EmptyState`.
   - `frontend/app/portal/components/FollowUpCard.tsx` — `Card variant="bone"`, date `font-mono`.
   - `frontend/app/portal/components/RedFlagsCard.tsx` — `Card variant="paper"` with `border-l-2 border-crimson`.

8. **Rewrite `frontend/app/components/ConsentGate.tsx`**:
   - Preserve consent checkbox logic and flow entirely.
   - Restyle using `Card variant="paper"`, `Checkbox` primitive, `Button variant="primary"`.

**Verification:**
```bash
cd frontend && npm run dev
# Manual check: /previsit/new, /portal, /portal/visits/[id]
# Confirm: paper/bone backgrounds, serif pull-quote for summary, mono dosages, crimson red-flags border, bilingual tabs work
```

**Phase 3 Acceptance Criteria:**
- [ ] Pre-visit chat renders with bone/paper chat bubbles, oxblood bot accent border, step progress
- [ ] Portal visit list uses Card primitives with Badge for status
- [ ] Visit detail page has PullQuote summary, DataRow medications with mono, bilingual Tabs
- [ ] Red flags card has crimson left border
- [ ] ConsentGate preserves checkbox logic with new styling
- [ ] No purple, no gradient, no Inter/Outfit visible
- [ ] `npm run build` succeeds

---

## Phase 4 — Doctor Surfaces

**Scope:** Rewrite all doctor workspace pages. This is the most complex phase — data-dense panels use slate background, editorial section numbering, mono typography for clinical data. All Playwright selectors must survive.

**Steps:**

1. **Rewrite `frontend/app/doctor/page.tsx`** (doctor dashboard):
   - Use `AppShell variant="paper"` for the outer shell.
   - Dashboard layout: visit queue summary + recent activity.
   - Use `StatTile` for KPI cards (active visits, pending reviews).
   - Visit list items use `Card variant="paper"` with `DataRow` for patient name, time, status.

2. **Rewrite `frontend/app/doctor/queue/page.tsx`**:
   - Table/list of queued visits. Each row: patient name, arrived time (`font-mono text-xs`), pre-visit status (`Badge`), action button.
   - Use `Card variant="paper"` as container.
   - Empty state: `EmptyState` with appropriate copy.

3. **Rewrite `frontend/app/doctor/finalized/page.tsx`**:
   - List of finalized visits. Each row: patient, finalized date (`font-mono text-xs`), published status (`Badge variant="published"`).
   - Pagination controls using `Button variant="secondary"`.

4. **Rewrite `frontend/app/doctor/components/DoctorNav.tsx`** (if exists, otherwise create):
   - Sub-nav: `bg-slate text-paper border-b border-slate` — dark nav for doctor workspace.
   - Tab links: "Dashboard", "Queue", "Finalized", current visit if applicable.

5. **Rewrite `frontend/app/doctor/components/PatientContextPanel.tsx`**:
   - `Card variant="slate"` for the patient context sidebar.
   - Patient name: `font-display text-lg text-paper`.
   - Recent visits section: `SectionHeader number="01" title="Recent Visits"`.
   - Data rows: `DataRow mono` for dates, `font-sans text-sm` for summaries.

6. **Rewrite `frontend/app/doctor/components/PhaseTabs.tsx`**:
   - Use `Tabs` primitive. Tab labels MUST be: "Pre-visit", "Consultation", "Preview" — preserve `getByRole("tab", { name: /consultation/i })`.
   - Active tab: oxblood bottom border. Inactive: `text-ink-soft`.

7. **Rewrite `frontend/app/doctor/visits/[visitId]/page.tsx`**:
   - Three-phase tab layout using `PhaseTabs`.
   - Preserve all state management, `refetch-before-#preview` logic, and conditional rendering.
   - AI draft sections: `Card` with `border-l-2 border-oxblood` + `Badge variant="draft"` reading "AI DRAFT".
   - Signed sections: plain `Card variant="paper"` + `Badge variant="published"` reading "Signed" with sage check icon.
   - Publish-to-patient button visibility tied to `previewApprovedAt` — preserve this logic exactly.

8. **Rewrite `frontend/app/doctor/visits/[visitId]/components/PreVisitSummary.tsx`**:
   - `Card variant="paper"` with `SectionHeader number="01" title="Pre-Visit Summary"`.
   - Content: `font-sans text-sm text-ink`, symptoms in a bulleted list.

9. **Rewrite `frontend/app/doctor/visits/[visitId]/components/ReportPreview.tsx`**:
   - SOAP note rendered with `SectionHeader` for each section: `01 — Subjective`, `02 — Objective`, `03 — Assessment`, `04 — Plan`.
   - Clinical data in `font-sans text-sm`, medications/dosages in `font-mono`.
   - Must render diagnosis text including "bronchitis" (preserves `getByText(/bronchitis/i)`).

10. **Rewrite `frontend/app/doctor/visits/[visitId]/components/review/GenerateBar.tsx`**:
    - Preserve button text "Generate report" exactly (Playwright selector).
    - Restyle: `Button variant="primary"` for generate, `Button variant="secondary"` for cancel.
    - Loading state: use `PhasedSpinner` with new styling.

11. **Rewrite `frontend/app/doctor/visits/[visitId]/components/review/ReportChatPanel.tsx`**:
    - `Card variant="paper"` for the chat panel.
    - Chat messages: doctor messages right-aligned `bg-bone rounded-md`, AI messages left-aligned with oxblood left border.
    - Clarification input: preserve `placeholder` containing "answer:" (`getByPlaceholder(/answer:/i)`).
    - Edit-prefix stripping in chat rendering: preserve existing logic.
    - Clarification bubble must be visible (not just placeholder).

12. **Rewrite `frontend/app/doctor/visits/[visitId]/components/review/ReportPanel.tsx`**:
    - `Card variant="slate"` for the report data panel.
    - SOAP sections with `SectionHeader`.
    - Editable fields: `Textarea` primitives with `font-sans text-sm`.
    - Preserve `aria-label="Consultation transcript"` on the consultation transcript textarea (`getByLabel("Consultation transcript")`).
    - MedList and ChipListEditor: null-safe, preserve existing component APIs.

13. **Rewrite `frontend/app/doctor/visits/[visitId]/components/review/SplitReview.tsx`**:
    - Two-panel layout: left=ReportPanel (`Card variant="slate"`), right=ReportChatPanel (`Card variant="paper"`).
    - Use CSS grid: `grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4`.
    - Remove `import "./review.css"` (that file will be deleted in Phase 5).
    - "Approve & continue" button: `Button variant="primary"` with text "Approve & continue" (Playwright selector).
    - "Publish to patient" button: `Button variant="primary"` with text "Publish to patient" (Playwright selector).
    - Published indicator: text containing "Published" (Playwright selector).

14. **Restyle `frontend/app/doctor/visits/[visitId]/components/review/PhasedSpinner.tsx`**:
    - Port existing logic. Restyle: spinner in `text-oxblood`, phase labels in `font-mono text-xs text-ink-soft`.

15. **Preserve all voice/live consultation features**:
    - Voice tab: drag-and-drop file upload area, `MP3/WAV/M4A/WebM/FLAC/OGG` hint text, transcribing spinner with filename display. Restyle with `Card variant="bone"`, dashed `border-2 border-dashed border-hairline` drop zone.
    - Live tab: mic button with `MM:SS` timer display, `PhasedSpinner` during processing, error states per tab. Mic button: `IconButton` with `variant="primary"` when recording.

**Verification:**
```bash
cd frontend && npm run typecheck && npm run build
cd frontend && npm run dev
# Manual check: /doctor, /doctor/queue, /doctor/finalized, /doctor/visits/[id]
# Confirm: slate panels for data, paper for chat, editorial section numbers, mono on clinical data,
#          oxblood AI-draft border, sage signed badge, all button texts preserved
```

**Phase 4 Acceptance Criteria:**
- [ ] Doctor dashboard renders with StatTile KPIs and visit list
- [ ] Queue page shows visit rows with badges and action buttons
- [ ] Finalized page shows published visits with pagination
- [ ] Visit detail page renders three-phase tabs with "Pre-visit", "Consultation", "Preview" labels
- [ ] `aria-label="Consultation transcript"` present on textarea
- [ ] "Generate report" button text preserved
- [ ] "Approve & continue" button text preserved
- [ ] "Publish to patient" button text preserved
- [ ] "Published" text visible in published state
- [ ] Clarification input has "answer:" placeholder
- [ ] Report content renders "bronchitis" text
- [ ] AI draft sections have oxblood left border + "AI DRAFT" badge
- [ ] Signed sections have sage check + "Signed" badge
- [ ] Voice tab has drag-drop zone with file type hint
- [ ] Live tab has mic button with timer
- [ ] MedList/ChipListEditor are null-safe
- [ ] Publish button visibility tied to `previewApprovedAt`
- [ ] No changes to `lib/api.ts`, `lib/agentSse.ts`, `lib/auth.ts`, `lib/reviewReducer.ts`
- [ ] `npm run build` succeeds

---

## Phase 5 — Cleanup

**Scope:** Delete obsolete CSS and unused components. Verify nothing is broken.

**Steps:**

1. **Delete `frontend/app/doctor/visits/[visitId]/components/review/review.css`**.

2. **Verify `SplitReview.tsx` no longer imports `review.css`** (should have been removed in Phase 4 step 13).

3. **Grep in-scope files for orphan className references** — any class that is a raw string (not a Tailwind utility) and is not in the legacy block. Fix or remove.

4. **Evaluate old `app/components/*` helpers for deletion**:
   - `LeafGlyph` — KEEP (used by `StaffNav.tsx` which is out of scope).
   - `HeroEmblem` — DELETE if not imported by any staff/admin page. Replaced by editorial wordmark.
   - `Illustration` — DELETE if not imported by any staff/admin page.
   - `AlertGlyph` — DELETE if not imported by any staff/admin page.
   - `EmptyState` (old) — KEEP in `app/components/` if imported by staff/admin. New one lives in `components/ui/EmptyState.tsx`.
   - `Skeleton` (old) — KEEP in `app/components/` if imported by staff/admin. New one in `components/ui/Skeleton.tsx`.
   - `PageHeader` (old) — KEEP if imported by staff/admin (they use `page-header` CSS class directly in JSX, not a component import — so check).
   - `RoleChip` — KEEP if imported by staff/admin.
   - For each: grep `app/staff/` and `app/admin/` for imports. If not imported, delete. If imported, keep.

5. **Final grep for remnant font references**: search all in-scope `.tsx` files for "Outfit", "Inter", any `font-*` class that references removed fonts. Remove them.

6. **Final grep for purple/violet**: search all in-scope `.tsx` files for `purple`, `violet`, `indigo`. Remove any occurrences.

**Verification:**
```bash
cd frontend && npm run typecheck && npm run build && npm run lint
```

**Phase 5 Acceptance Criteria:**
- [ ] `review.css` deleted
- [ ] No orphan CSS class references in in-scope files
- [ ] No "Outfit", "Inter", "purple", "violet", "indigo" references in in-scope files
- [ ] Unused old components deleted (only those not imported by staff/admin)
- [ ] Staff and admin pages still render correctly
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes (or only pre-existing warnings)

---

## Phase 6 — Evaluation (evaluator agent brief)

**Scope:** Automated and visual verification that the redesign is correct, complete, and non-breaking.

**Steps:**

1. **Run Playwright E2E specs**:
   ```bash
   cd frontend && npx playwright test e2e/post-visit-review-happy-path.spec.ts e2e/post-visit-review-clarification.spec.ts
   ```
   Both specs must pass. All nine Playwright selectors must resolve.

2. **Visual audit via Playwright MCP browser** — for each page below, navigate and take a screenshot, then verify:
   - `/` — Fraunces display heading, oxblood CTA button, no purple, no gradient, paper background.
   - `/login` — Centered form, "Email" + "Password" labels, "Sign in" button, no purple.
   - `/previsit/new` — Chat interface with bone/paper bubbles, step indicator.
   - `/portal` — Visit list with cards, badges.
   - `/portal/visits/[id]` — PullQuote summary, bilingual tabs, medication DataRows with mono, red-flags with crimson border.
   - `/doctor` — Dashboard with StatTiles, paper background.
   - `/doctor/queue` — Visit queue table/list.
   - `/doctor/finalized` — Finalized list with published badges.
   - `/doctor/visits/[id]` — Slate data panels, paper chat panel, editorial section numbers, AI-draft oxblood border + badge, "Generate report" button, transcript textarea.

3. **Contract-drift check**:
   ```bash
   git diff master -- frontend/lib/api.ts frontend/lib/reviewReducer.ts frontend/lib/agentSse.ts frontend/lib/auth.ts
   ```
   Expected: no changes (empty diff), or at most minor additive changes (new type exports). No deletions, no signature changes.

4. **Staff + admin smoke test**: Open `/staff` and `/admin` in dev — pages must render correctly with legacy CSS classes. No broken layouts, no missing styles, no console errors about undefined CSS.

5. **Font verification**: In browser dev tools on any in-scope page, inspect computed font-family. Must show `IBM Plex Sans` for body text, `Fraunces` for headings, `JetBrains Mono` for mono elements. No `Outfit` or `Inter` computed anywhere.

6. **Produce severity-ranked issue list**:
   - CRITICAL: Playwright spec failures, broken API contracts, missing Playwright selectors, staff/admin pages broken.
   - HIGH: Wrong font rendering, purple/gradient visible, missing AI-draft visual distinction.
   - MEDIUM: Inconsistent spacing, missing motion, minor a11y issues.
   - LOW: Minor style tweaks, polish items.

---

## Overall Acceptance Criteria

- [ ] All nine Playwright selectors resolve correctly in both E2E specs
- [ ] Both E2E specs pass: `post-visit-review-happy-path` and `post-visit-review-clarification`
- [ ] Zero changes to `lib/api.ts`, `lib/agentSse.ts`, `lib/auth.ts`, `lib/reviewReducer.ts`
- [ ] Staff (`/staff/*`) and admin (`/admin/*`) pages render correctly with legacy CSS
- [ ] Fraunces for display, IBM Plex Sans for body, JetBrains Mono for mono — no Outfit/Inter
- [ ] Oxblood (`#7A2E2E`) is the primary accent — no purple, violet, or indigo anywhere
- [ ] Paper (`#F6F1E6`) backgrounds — no gradients
- [ ] AI draft sections: oxblood left border + "AI DRAFT" badge
- [ ] Signed sections: plain card + sage "Signed" badge
- [ ] Doctor data panels use slate background with mono typography for clinical data
- [ ] Editorial section numbers (`01 — Subjective`, etc.) on SOAP note sections
- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (or only pre-existing warnings)
- [ ] `review.css` deleted, no orphan CSS classes in in-scope files

## Evaluation Rubric

- **Functionality** (weight 0.3): All Playwright specs pass. All nine selectors resolve. All pages render without runtime errors. Staff/admin pages unbroken. API contracts unchanged.
- **Craft** (weight 0.3): Consistent use of design tokens (no raw hex colors). All primitives use cva variants. Motion is disciplined (one stagger per page, 150ms hover transitions, reduced-motion respected). Error states handled. Loading skeletons present. Null-safe data rendering.
- **Design** (weight 0.2): Clinical Editorial aesthetic achieved — Fraunces display type, paper/bone warmth, oxblood accent, slate doctor panels, mono clinical data, hairline dividers, editorial section numbers. No AI-slop patterns (no gradient heroes, no generic card grids, no purple).
- **Completeness** (weight 0.2): All 10 pages in scope are rewritten. All 23 UI primitives created. All legacy classes preserved. Cleanup done (review.css deleted, orphans removed). Both E2E specs pass.
