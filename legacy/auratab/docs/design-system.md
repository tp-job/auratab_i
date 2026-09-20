# Spec-Sheet Docs — A Portable Design System for Documentation Pages

> Extracted from the live `/work/docs` page of **nevinas_ka_i** (Nocturnal Atelier v3.2),
> generalised so it can be dropped into any project, any stack, and read by any role.
>
> **One-line idea:** *documentation is read like a spec sheet — scanned down a column,
> grouped by typography and hairlines, never by boxes inside boxes.*

---

## 0. How to use this file

The system is split into **three layers**. Only the first one is project-specific.

| Layer | What it is | Change it per project? |
|---|---|---|
| **L1 · Primitives** | Raw colour ramp, font families | **Yes** — swap for your brand |
| **L2 · Semantic tokens** | `text`, `surface`, `border`, `accent`… with light + dark values | Re-point to your L1, keep the names |
| **L3 · Patterns** | Layout, type scale, components, rules | **No** — this is the reusable part |

**Porting to a new project in 4 steps**

1. Replace the L1 ramp (§2.1) with your brand's 9–11 step ramp, light → dark.
2. Re-point each L2 token (§2.3) to an L1 step. Keep the names.
3. Re-run the contrast check (§2.4). Every text token must hit ≥ 4.5:1, every non-text
   indicator ≥ 3:1, **in both modes**. If one fails, move it one ramp step — don't dim it.
4. Build components from §5 using only L2 tokens. Never reference an L1 hex inside a component.

### Reading guide by role

| Role | Read first | You own |
|---|---|---|
| **Product / UX designer** | §1 Principles, §3 Type, §4 Layout, §9 Anti-patterns | Hierarchy, rhythm, what gets a box and what doesn't |
| **Frontend engineer** | §2 Tokens, §5 Components, §6 States, §10 Implementation | Token wiring, semantics, a11y, responsive behaviour |
| **Backend / full-stack** | §5.9 Index list, §5.11 States, §7 Content | Data shapes that feed the page, error messages that are shown verbatim |
| **Tech writer / content** | §7 Content & voice, §5.6 Callout | Leads, section subtitles, callout usage |
| **QA / accessibility** | §6 States, §8 Checklist | Contrast, focus, keyboard, reduced motion, breakpoints |
| **PM / lead** | §1, §8 Checklist, §11 Definition of done | What "done" means for a docs page |
| **AI coding agent** | §1, §2.3, §5, §9, §10 | Follow tokens and anti-patterns literally; never invent new colours |

---

## 1. Principles

1. **One level of structure.** Content sits on the page. Groups are separated by a
   small-caps label over a hairline rule — not by another bordered, rounded card.
   If every level has the same border and radius, the borders carry no information.
2. **Size leads hierarchy, not weight.** The page title is the *largest* and the *lightest*.
   A section heading must never out-weigh the title that owns it. Max weight: **600**.
3. **Prose is capped, structure is not.** Paragraphs live in a reading column (`85ch`).
   Headings, rules, tables and grids span the full content width.
4. **Measure, don't claim.** Contrast ratios, type sizes and token values shown on a docs
   page are computed from the live stylesheet, never hand-copied. Two hand-maintained
   lists of hex codes will drift.
5. **Every token has two values.** Light and dark are one token, not two palettes.
6. **Few, high-quality primitives.** If a workflow can't be explained in one screen, simplify it.
7. **Decoration must carry information.** An icon identical on half the rows is noise.
   A colour chip next to a hex *is* the value — that one stays.
8. **The docs page is its own proof.** The type scale it documents is the one it renders.

---

## 2. Tokens

### 2.1 L1 · Primitive ramp (reference implementation — replace per project)

A single cool, desaturated blue-violet ramp, 11 steps, pale → deepest.

| Step | Name | Hex | Typical role |
|---|---|---|---|
| 50 | Periwinkle Pale | `#E8EAF5` | Dark-mode primary text |
| 100 | Periwinkle | `#C8CDEB` | Dark-mode accent |
| 200 | Periwinkle Mid | `#A8B0D9` | Light-mode info border |
| 300 | Cool | `#878CB4` | Dark-mode muted text, decorative accent |
| 400 | Cool Deep | `#5E6491` | Light-mode muted text |
| 500 | Haze Light | `#6B739A` | — |
| 600 | Haze | `#465078` | **Light-mode accent**, tertiary text |
| 700 | Haze Deep | `#2E3558` | Solid accent fill |
| 800 | Midnight | `#1E233C` | Light-mode primary text |
| 900 | Midnight Deep | `#13172B` | Deep surfaces |
| 950 | Charcoal | `#0A0F19` | Dark-mode page background |

**Light page background:** `#F0F1F8` (a tint just off white, not pure `#FFF`).

### 2.2 L1 · Sub-palette (decorative only)

For gradients, glows, particles, illustration. **Never** for text, buttons, borders or
anything a user must read or click.

| Name | Hex | Note |
|---|---|---|
| French Gray | `#B8BED7` | cool gap-filler |
| Cool Gray Sub | `#AFAECC` | purple gap-filler |
| Mountbatten Pink | `#85758F` | the single warm tone — ≤ ~30% of accents |
| English Violet 1 | `#524E68` | warmer mid |
| English Violet 2 | `#44405A` | deep anchor |

> **Porting rule:** keep a sub-palette separate from the UI ramp in *your* project too.
> Mixing "decorative" and "functional" colours in one list is how a pink ends up on a button.

### 2.3 L2 · Semantic tokens (keep these names in every project)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `bg` | `#F0F1F8` | `#0A0F19` | Page background |
| `surface` | `rgba(255,255,255,.55)` | `rgba(30,35,60,.50)` | Panels, hover wash |
| `surface-2` | `rgba(255,255,255,.82)` | `rgba(46,53,88,.65)` | Inputs, code blocks, skeletons |
| `border` | `rgba(30,35,60,.10)` | `rgba(200,205,235,.10)` | Hairlines, section rules |
| `border-soft` | `border` @ 60% | `border` @ 60% | Row separators inside a group |
| `text` | `#1E233C` | `#E8EAF5` | Headings, body, row labels |
| `text-secondary` | `#2C3352` | `#AEB5D9` | Leads, subtitles, values |
| `text-tertiary` | `#465078` | `#C8CDEB` | Column headers, meta |
| `text-muted` | `#5E6491` | `#878CB4` | Timestamps, counts, placeholders |
| `accent` | `#465078` (Haze) | `#C8CDEB` (Periwinkle) | Links, active TOC item, focus ring |
| `focus-ring` | `accent` | `accent` | `outline: 2px solid; offset 2px` |

> **The accent must flip with the theme.** A pale accent pinned for dark mode was measured
> at **1.11:1** on a light background. Always define `accent` as a per-mode token.

### 2.4 Measured contrast (WCAG 2.x, against `bg` of the same mode)

| Token | Light | Dark | Grade |
|---|---|---|---|
| `text` | 13.70 | 15.99 | AAA |
| `text-secondary` | 10.95 | 9.51 | AAA |
| `text-tertiary` | 6.96 | 12.22 | AA / AAA |
| `text-muted` | 5.03 | 5.88 | AA |
| `accent` | 6.96 | 12.22 | AA / AAA |

Translucent tokens (`surface`, `border`) get a dash, never a guessed number — contrast of
an `rgba` depends on what's beneath it.

### 2.5 Status tokens (Callout, Toast, inline alerts)

Each status carries **both** modes. Light values are dark text on a pale tint; dark values
are pale text on a deep tint.

| Variant | Mode | bg | border | text | accent | Icon |
|---|---|---|---|---|---|---|
| info | light | `rgba(200,205,235,.78)` | `#A8B0D9` | `#1E233C` | `#465078` | `info` |
| info | dark | `rgba(46,53,88,.82)` | `rgba(200,205,235,.28)` | `#E8EAF5` | `#C8CDEB` | |
| success | light | `rgba(200,240,210,.72)` | `#A5D6A7` | `#1B5E20` | `#2E7D32` | `check` |
| success | dark | `rgba(30,50,40,.85)` | `rgba(134,239,172,.34)` | `#D6F0DD` | `#86EFAC` | |
| warning | light | `rgba(255,236,214,.78)` | `#FFCC80` | `#7A3B00` | `#E65100` | `alert` |
| warning | dark | `rgba(58,44,26,.85)` | `rgba(251,191,36,.34)` | `#F6E3C4` | `#FBBF24` | |
| error | light | `rgba(255,218,214,.78)` | `#EF9A9A` | `#8E1414` | `#C62828` | `error-warning` |
| error | dark | `rgba(58,30,32,.85)` | `rgba(252,165,165,.34)` | `#F7DADA` | `#FCA5A5` | |

Measured: body text 6.47–12.06 (≥ 4.5), icons 3.30–10.31 (≥ 3). **Do not add opacity to
callout text** — a "soft" 0.85 opacity dropped success to 4.54, one rounding error from failing.

> Status colours are the one place this system leaves the brand ramp. That is deliberate:
> green/amber/red carry meaning users already know. Keep them in their own module.

---

## 3. Typography

**Families**
- **Sans (UI + body):** Inter, weights 300 / 400 / 500 / 600. Fallback `system-ui, sans-serif`.
- **Secondary script (optional):** Zen Kaku Gothic New for a Japanese subtitle, 300 / 400 / 500.
  Porting: replace with any locale caption face, or drop it.
- **Mono:** system stack (`ui-monospace, Menlo, Consolas…`). No webfont download.

**Rules:** no weight above 600. Size carries hierarchy. Numbers in tables and counts use
`font-variant-numeric: tabular-nums`.

### 3.1 Scale (the one the page actually renders)

| Role | Size | Weight | Line-height | Tailwind |
|---|---|---|---|---|
| Page title (h1) | 36 → 48px (`sm`+) | 400 | tight | `text-4xl sm:text-5xl` |
| Locale subtitle | 20px | 400 | normal | `text-xl font-zen` |
| Section heading (h2) | 28px | 500 | 1.25 | `text-[1.75rem] font-medium` |
| Lead / eyebrow | 18px | 400 | normal | `text-lg` |
| Body | 16px | 400 | 1.625 | `text-base leading-relaxed` |
| Meta / row / caption | 14px | 400 | normal | `text-sm` |
| Value / code | 12px mono | 400 | relaxed | `font-mono text-xs` |
| Group label | 12px, uppercase, tracking 0.14em | 500 | normal | `text-xs font-medium uppercase tracking-[0.14em]` |
| Micro badge | 10px, uppercase, tracking-wider | 500 | normal | `text-[10px] uppercase` |

Heading ↔ weight check: title 400 > section 500 in size, **not** in weight — correct.
Section 600 under a title 400 is the inversion to avoid.

---

## 4. Layout & spacing

**Base unit:** 8px (4px allowed for tight inline gaps).

### 4.1 Page shell

```
┌ app shell ─────────────────────────────────────────────────────────┐
│ sidebar │  main (scroll container, NOT the viewport)               │
│         │  gutter: 20px · lg 32px · xl 8%                          │
│         │  ┌ Breadcrumb ─────────────────────────────── mb 32 ┐    │
│         │  │ PageHeader (eyebrow / h1 / locale)          mb 24 │    │
│         │  │ Lead + intro paragraph (85ch) + Callout           │    │
│         │  └───────────────────────────────────────────────────┘    │
│         │  mt 40                                                   │
│         │  ┌ content (minmax(0,1fr)) ───────┐ gap 48 ┌ rail 15rem ┐ │
│         │  │ DocSection × n   (mb 80 each)  │        │ On this    │ │
│         │  │                                │        │ page (sticky)│
│         │  └────────────────────────────────┘        └────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

- **Do not add a second max-width + padding wrapper** inside the page. Inherit the shell's
  gutter so every page in the section starts on the same left edge.
- The opening block (breadcrumb, header, lead) sits **above** the two-column grid at full
  width, so it aligns with sibling pages that have no rail.

### 4.2 Breakpoints

| Width | Behaviour |
|---|---|
| < 1024 (`lg`) | Single column. TOC becomes a **closed** native `<details>` **above** the content. |
| ≥ 1024 | Grid `[minmax(0,1fr) 15rem]`, gap 48px. TOC is a sticky right rail (`top: 16px`). |

Match the rail breakpoint to wherever the rest of the app switches to desktop chrome
(e.g. persistent sidebar). A docs page that goes "desktop" 256px later than its shell
leaves a dead zone.

### 4.3 Vertical rhythm (two-level on purpose)

| Gap | Value |
|---|---|
| Section heading → subtitle | 6px (`mb-1.5`) — one unit |
| Subtitle → body | 32px (`mb-8`) |
| Blocks inside a section body | 24px (`space-y-6`) |
| Group → group (spec sections) | 48px (`mb-12`) |
| Section → section | 80px (`mb-20`) |

Title+subtitle read as one unit; gaps grow as the grouping gets coarser.

### 4.4 Widths

| Thing | Width |
|---|---|
| Running paragraphs, section subtitles | `max-width: 85ch` |
| Headings, section rules, tables, grids, code, timelines | full content width (`wide`) |
| Wide tables on phones | scroll inside their own `overflow-x:auto` wrapper with a `min-width` |

### 4.5 Radii & borders

| Element | Radius |
|---|---|
| Colour chip / ramp strip | 3px |
| Inputs, select | 8px (`rounded-lg`) |
| Callout, code block, disclosure | 12px (`rounded-xl`) |
| Index list container / card | 16px (`rounded-2xl`) |
| Badges | full |

Borders are always **1px hairlines** in `border` / `border-soft`. The only thick border is
the Callout's 4px left accent bar.

---

## 5. Components

Each entry: **purpose · anatomy · tokens · rules.** Tailwind classes are given as the
reference implementation; the token column is what matters when porting.

### 5.1 Breadcrumb
- **Anatomy:** `nav` › items separated by `/` at 60% opacity.
- **Tokens:** linked items `accent` (underline on hover); current item `text`; separators `text-secondary`.
- **Size:** 14px, `mb-8`.

### 5.2 PageHeader
- **Anatomy:** eyebrow `<p>` (18px) → title `<h1>` (36/48px, 400) → optional locale subtitle `<p>` → optional right-aligned `actions` slot.
- **Rules:** exactly one `<h1>` per page. Eyebrow and subtitle are `<p>`, not headings — a
  label is not a section. Wraps with `flex-wrap items-end justify-between gap-3`, `mb-6`.

### 5.3 SectionHeading (h2, linkable)
- **Anatomy:** title + hover-revealed `#` anchor link; bottom hairline rule, full width.
- **Tokens:** text `text`; rule `border`; anchor `text-muted` → `accent` on hover.
- **Rules:**
  - `id` = slug of the title; `data-doc-section="<title>"` is the contract the TOC reads.
  - `scroll-margin-top: 96px` so deep links clear a fixed mobile bar.
  - Anchor is `opacity:0` until `group-hover` **or** `focus-visible` — keyboard users must see it.
  - `aria-label="Link to section: <title>"`.

### 5.4 DocSection
- **Props:** `title`, `subtitle?`, `wide?`, `children`.
- **Behaviour:** heading always full width; subtitle always 85ch; body 85ch unless `wide`.
- **Use `wide` for** anything *looked at* (tables, grids, code, timelines). Leave it off for
  anything *read* (paragraphs, bullet lists).

### 5.5 GroupLabel — the only structural device inside a section
- **Anatomy:** `<h4>` small-caps label + optional inline note, over a hairline.
- **Tokens:** label `text` 12px/500/uppercase/0.14em; note `text-muted` 12px; rule `border`.
- **Rule:** replaces nested cards. A label and a rule cost one line and carry the same
  grouping information.

### 5.6 Callout
- **Props:** `title`, `children`, `variant = info | success | warning | error`, `icon?`.
- **Anatomy:** 20px padding, 12px radius, 4px left border in `accent`, icon (20px) + bold title + 14px body.
- **Tokens:** §2.5 per variant and mode.
- **Rules:** `role="alert"` **only** for `warning` and `error`. Body text at full opacity.
  One callout per idea; don't stack three in a row.
- **Content:** title is a noun phrase ("Design principle", "Breaking change"), body ≤ 2 sentences.

### 5.7 Spec row list (`<dl>`) — for key → value manifests
Used by Architecture ("Framework → React 19 + TypeScript") and palettes.
- **Anatomy:** `dt` label left (flex-1, truncate) · `dd` value right (mono 12px, `max-width:60%`, wraps).
- **Tokens:** label `text`; value `text-secondary`; row separator `border-soft`; last row no border.
- **Size:** 14px, `py-1.5`.
- **Rules:** values **wrap** instead of truncate — the qualifier at the tail is usually the useful part.
  No per-row icons unless every row has a distinct, meaningful one.

### 5.8 Token table (light | dark in one table)
- **Columns:** Token · Light · Dark. Each cell: 16px chip + mono hex; text tokens add a contrast readout (`13.70 AAA`).
- **Rules:** pair rows **by name, not index**. A token present in one mode only renders a
  `—` in the other so the asymmetry is visible. Wrapper `overflow-x:auto`, table `min-width: 34rem`.
- **Chip:** 16×16, 3px radius, 1px **inset** ring (`black/15` light, `white/15` dark), no hover effect —
  a swatch is a readout, not a button.
- **Ramp strip:** 48px tall, bands butted with **no gap**, so tonal order reads in one glance.
- **Contrast grade:** `Fail` in error colour; otherwise `text-muted`, 10px uppercase.

### 5.9 Index list (filterable)
A compact chooser, not a second browser.
- **Filter bar:** search input (leading search icon, placeholder "Filter by name…") + native
  `<select>` ("All languages") + live count `12 of 21` (12px, tabular, `text-muted`).
  Inputs: 8px radius, `surface-2` bg, `border`, `py-1.5`, 14px.
- **List:** one card container (16px radius, `border`), rows divided by `border`.
  Each row is a full-width `<button>`: name (14px/500, truncate) · meta dot + language (12px) · timestamp right (12px tabular, `text-muted`).
  Hover `surface` @ 40–60%. `aria-label="Read the README for <name>"`.
- **Footer link** to the full browser: "Looking for X? *Browse all …*" in `accent`, underlined, underline removed on hover.

### 5.10 Code block
- **Anatomy:** header bar (language label 12px uppercase `text-muted` · Copy button) over a
  `<pre>` that scrolls horizontally.
- **Tokens:** bg `surface-2`; border `border`; code `text`, mono 14px, `leading-relaxed`.
- **Copy:** `navigator.clipboard.writeText`; icon + label flip to "Copied" for 2s;
  `aria-label` flips too. No syntax-highlighting dependency for shell/JSON/trees.

### 5.11 On-this-page rail (TOC)
- **Anatomy:** label "On this page" (12px caps, `text-muted`) · list with a 1px left rail.
  Items 14px, `py-1.5 pl-4`, each with its own left border overlapping the rail (`-ml-px`).
- **States:** default `text-secondary`, transparent border · hover `text` + `border` ·
  **active** `accent` text + `accent` border + 500 weight, `aria-current="true"`.
- **Behaviour:**
  - Discover sections from the DOM (`[data-doc-section]`), not a hand-kept list.
  - `IntersectionObserver` **rooted on the real scroll container** (walk up to the first
    `overflow-y: auto|scroll` ancestor). Rooting on the viewport works on first paint and then never updates.
  - `rootMargin: "-96px 0px -66% 0px"` — trips when a heading enters the upper third; topmost visible wins.
  - Sticky with `max-height: calc(100svh - 6rem)` and its own scroll.
- **Mobile:** native `<details>` (closed by default), summary 12px caps with a chevron that rotates 90° on open.
  At `lg`, `display: contents` removes the disclosure box so the rail layout applies directly.

### 5.12 Timeline (changelog)
- **Anatomy:** entries with `pl-8`; a 1px vertical line in `border`; a 10px dot overlapping it.
  Header row: version (14px/600) · date pill (10px, `surface-2`) · "Latest" pill on the first entry (`accent` @10% bg, `accent` text).
  Changes: 12px `text-secondary` bullets with a 4px dot.
- **Dots:** step down the ramp by recency (newest = lightest accent step).

### 5.13 States: loading · empty · no-match · error

| State | Pattern |
|---|---|
| Loading | 6 skeleton rows matching real row geometry; bars `surface-2`, `animate-pulse` |
| Empty | Centred 14–16px `text-secondary`, `py-8`: "No repositories found" |
| No match | Echo the query: *No repositories match "foo" in TypeScript.* |
| Error | Show the **server's** message when there is one ("README not found for this repository"), fall back to a generic line only when there isn't |
| Optional data failed | Section renders empty rather than crashing the page |

---

## 6. Interaction states

| State | Rule |
|---|---|
| Focus | `outline: 2px solid accent; outline-offset: 2px` on **`:focus-visible`** only. Inside a list row, offset `-2px` so the ring stays within the row. |
| Hover (rows, summary) | Background wash `surface` @ 40–60%, `transition-colors` |
| Hover (links) | Underline toggles (on→off for body links, off→on for breadcrumbs) |
| Active nav | Colour + border + weight 500 — never colour alone |
| Motion | Colour/opacity/rotate transitions only. No lift, no shadow-on-hover for non-interactive items. Respect `prefers-reduced-motion`. |
| Theme switch | `320ms cubic-bezier(0.22, 1, 0.36, 1)` |

---

## 7. Content & voice

- **Lead** (18px, `text-secondary`): one line naming what the page covers.
  *"Architecture, design system, and project guides."*
- **Intro** (16px, `text`): 1–2 sentences of plain fact about the system.
- **Section subtitle:** one short sentence, sentence case, no trailing jargon.
  *"What this site is built from, by layer."*
- **Don't promise a section the page doesn't have.** A lead that lists a missing section is worse than no lead.
- Remove sections with no real reader (e.g. an API reference for an internal API with no consumer).
- **Order sections from most orienting to deepest:** Overview → Architecture → Structure →
  Design system → Changelog → Deep drill-downs.
- Labels are sentence case; group labels are the only ALL-CAPS text (via CSS, not typed caps).
- Role names from code keys: split camelCase, sentence-case it, and keep an explicit
  exception map for initialisms (`threeD → 3D`, `externalApi → External API`).

---

## 8. Quality checklist (QA, a11y, review)

**Structure**
- [ ] Exactly one `<h1>`; sections are `<h2>`; group labels `<h4>`; eyebrows are `<p>`
- [ ] Every section heading has an `id` and a working `#` anchor, visible on focus
- [ ] No more than one level of bordered container in any section
- [ ] Opening block aligned with sibling pages (no extra inner padding wrapper)

**Colour & contrast**
- [ ] Every text token ≥ 4.5:1 in **both** modes; icons/indicators ≥ 3:1
- [ ] Accent is a per-mode token, not a fixed hex
- [ ] No sub-palette colour on text, buttons or borders
- [ ] Components reference L2 tokens only — `grep` for raw hex in component files

**Type**
- [ ] No weight > 600; section headings not heavier than the page title in visual dominance
- [ ] Numbers in tables/counts are tabular

**Responsive**
- [ ] Checked at 375, 768, 1024, 1440
- [ ] No horizontal page scroll; wide tables scroll in their own wrapper
- [ ] TOC is a closed disclosure above content below `lg`; sticky rail at `lg`+

**Behaviour**
- [ ] TOC active item updates while scrolling (observer rooted on the real scroller)
- [ ] Filters show a live `n of m` count and an echoing no-match message
- [ ] Copy button works and announces "Copied"
- [ ] Loading skeletons match final row geometry (no layout shift)
- [ ] Keyboard: every interactive element reachable, focus ring visible
- [ ] `prefers-reduced-motion` disables non-essential animation

---

## 9. Anti-patterns (each one was a real defect)

| Don't | Why | Do |
|---|---|---|
| Nest cards 3–5 deep, each with the same border/radius | Boundaries stop meaning anything | One level; GroupLabel + hairline |
| Hover-lift + shadow on swatches/info cards | Implies an interaction that doesn't exist | Static readout |
| Separate light and dark palette panels | Reader hunts for each token's twin | One table, two value columns |
| Hand-copy hex values into docs data | Drifted: 4 of 5 semantic swatches were wrong | Resolve from the live stylesheet; data is fallback only |
| Pin the accent to a dark-mode colour | 1.11:1 on light backgrounds | Per-mode `accent` token |
| Put `max-width: 68ch` on headings too | Page read as a different page from siblings | Cap prose only |
| A generic icon on rows without a mapping | Half the rows share one glyph = noise | No icon, or a real one on every row |
| Pair light/dark tokens by array index | Silent misalignment when one list grows | Pair by name; show `—` for gaps |
| `IntersectionObserver` on the viewport inside a scrolling `main` | Never updates after first paint | Root on the actual scroll container |
| Opacity on status body text "for softness" | Eroded contrast to 4.54 | Full opacity; pick a softer token instead |
| Flat, equal spacing between every block | Nothing groups | Two-level rhythm (§4.3) |
| TOC below the content on mobile | A table of contents under what it indexes is useless | Closed disclosure above |
| Heavy syntax highlighter for shell snippets | Weight on the critical path for no gain | Plain mono block + copy |

---

## 10. Implementation reference

### 10.1 Plain CSS variables (framework-agnostic)

```css
:root {
  /* L1 — replace per project */
  --ramp-50:#E8EAF5; --ramp-100:#C8CDEB; --ramp-200:#A8B0D9; --ramp-300:#878CB4;
  --ramp-400:#5E6491; --ramp-600:#465078; --ramp-700:#2E3558; --ramp-800:#1E233C;
  --ramp-950:#0A0F19;

  /* L2 — light */
  --bg:#F0F1F8;
  --surface:rgba(255,255,255,.55);
  --surface-2:rgba(255,255,255,.82);
  --border:rgba(30,35,60,.10);
  --text:var(--ramp-800);
  --text-secondary:#2C3352;
  --text-tertiary:var(--ramp-600);
  --text-muted:var(--ramp-400);
  --accent:var(--ramp-600);

  /* Type & rhythm */
  --font-sans:"Inter",system-ui,sans-serif;
  --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --measure:85ch;
  --rail:15rem;
  --ease:cubic-bezier(.22,1,.36,1);
}
.dark {
  --bg:var(--ramp-950);
  --surface:rgba(30,35,60,.50);
  --surface-2:rgba(46,53,88,.65);
  --border:rgba(200,205,235,.10);
  --text:var(--ramp-50);
  --text-secondary:#AEB5D9;
  --text-tertiary:var(--ramp-100);
  --text-muted:var(--ramp-300);
  --accent:var(--ramp-100);
}
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
```

### 10.2 Tailwind v4 wiring

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* Colours must be declared INSIDE @theme to generate utilities.
     A --color-* declared elsewhere produces no class and fails silently. */
  --color-periwinkle:#C8CDEB;
  --color-haze:#465078;
  /* …rest of L1… */
  --color-light-text:#1E233C;
  --color-dark-text:#E8EAF5;
  /* …rest of L2 per mode… */
  --color-accent-ui:var(--accent-ui);
  --font-inter:"Inter",system-ui,sans-serif;
}
:root { --accent-ui: var(--color-haze); }
.dark { --accent-ui: var(--color-periwinkle); }
```

Usage: `text-light-text dark:text-dark-text`, `border-light-border dark:border-dark-border`,
`text-accent-ui`, `focus-visible:outline-accent-ui`.

### 10.3 Shared class constants

```ts
export const proseCls = "max-w-[85ch]";
export const cardCls =
  "bg-light-surface dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-2xl relative overflow-hidden";
```

### 10.4 Contrast helper (keep docs honest)

```ts
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const grade = (r: number) => (r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA Large" : "Fail");
```

Resolve token values at runtime with `getComputedStyle(document.documentElement).getPropertyValue("--token")`
and feed them to the table, so the documented value is always the shipped value.

---

## 11. Definition of done for a docs page

1. Passes every box in §8.
2. Zero raw hex in component files; all colour via L2 tokens.
3. The token/type sections are generated from live values, not typed.
4. Every section has a real reader; no promised-but-missing sections.
5. Screenshots at 375 / 1024 / 1440 in light **and** dark reviewed side by side with a sibling page — same left edge, same header, same gutter.
