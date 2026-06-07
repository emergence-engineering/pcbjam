# Brand & Design Guide — KiCad in the Browser

> Technical brand guide for the marketing/landing site (`/site`, Astro 6) and any
> future product UI surfaces. This is the single source of truth for color,
> typography, spacing, and component tokens.
>
> **Product in one line:** *Real KiCad — the PCB/schematic EDA tool — running in
> your browser via WebAssembly, with real‑time collaboration.*

---

## 1. Positioning & voice

| | |
|---|---|
| **What it is** | KiCad PCBnew/Eeschema compiled to WebAssembly, runnable in any modern browser, with multiplayer (presence, shared cursors, live editing). |
| **Who it's for** | Hardware engineers, EE students, open‑hardware teams, hobbyists who don't want to install a desktop toolchain. |
| **Feeling** | Precise, technical, trustworthy, fast. "An instrument, not a toy." Engineering‑grade, but approachable because it's *just a URL*. |
| **What it is not** | Not a watered‑down web clone. It is *the actual KiCad engine*. Lean into that authenticity. |

### Voice & tone

- **Plain and precise.** Engineers smell marketing fluff. Say what it does.
  *"Open a `.kicad_pcb` from a link. Two people edit it at once."* — not *"Unleash
  your design potential."*
- **Confident, not hype.** Numbers and verbs over adjectives.
- **Respect the heritage.** KiCad is a beloved open‑source project. We extend it;
  we don't claim it. Be clear about the relationship (see §10, Logo & attribution).
- **Builder‑to‑builder.** Code snippets, real file names, real keyboard shortcuts
  are on‑brand. The audience reads monospace fluently.

### Three pillars (use as feature headings / section themes)

1. **No install** — it's a browser tab. Zero toolchain, zero setup.
2. **Real KiCad** — the genuine engine, not a re‑implementation.
3. **Together** — real‑time collaboration: presence, shared cursors, live edits.

---

## 2. Color system

The site today is **dark‑first** (`--bg: #0b1020`, accent `#4f7cff`, blue "K"
favicon `#1d4ed8`). This guide formalizes those existing values into full scales
and adds the missing semantic + collaboration palettes. **Everything here is
backward‑compatible with the current `site/src/styles/global.css`.**

### 2.1 Brand primary — "Circuit Blue"

The core identity color. Anchored on the existing accent `#4f7cff` (= `500`) and
the favicon blue `#1d4ed8` (= `700`).

| Token | Hex | Use |
|---|---|---|
| `primary-50`  | `#eef3ff` | tint backgrounds, hover wash on light |
| `primary-100` | `#dbe4ff` | subtle fills |
| `primary-200` | `#bccdff` | borders on light, disabled text |
| `primary-300` | `#93acff` | secondary links on dark |
| `primary-400` | `#6b8eff` | hover state of links on dark |
| `primary-500` | `#4f7cff` | **brand accent** (links, focus rings, highlights) |
| `primary-600` | `#2f57f5` | **primary button bg** (best white‑text contrast) |
| `primary-700` | `#1d4ed8` | button hover/active, favicon |
| `primary-800` | `#1e40af` | pressed |
| `primary-900` | `#1b357f` | deep accents |
| `primary-950` | `#131f54` | accent on near‑black |

> ⚠️ **Contrast note:** white text on `primary-500` (`#4f7cff`) is ~3.4:1 — fine
> for large/bold text but **fails AA for body text**. For text‑bearing buttons use
> **`primary-600`** (`#2f57f5`, ~4.6:1) or darker. Use `500` for links/accents on
> the dark background, where it sits at ~6:1 against `#0b1020`.

### 2.2 Secondary — "Signal Green" (live / connected)

Green is the language of "on", "connected", "valid" — and nods to PCB soldermask
and DRC‑clean. Use it for **collaboration presence ("online"), success, and
connection state**, *not* as a second brand color competing with blue.

| Token | Hex | Use |
|---|---|---|
| `signal-50`  | `#ecfdf3` | |
| `signal-100` | `#d1fadf` | |
| `signal-200` | `#a6f4c5` | |
| `signal-300` | `#6ce9a6` | "online" dot on dark |
| `signal-400` | `#32d583` | live indicators, success text on dark |
| `signal-500` | `#12b76a` | success fills |
| `signal-600` | `#039855` | success button |
| `signal-700` | `#027a48` | |
| `signal-800` | `#05603a` | |
| `signal-900` | `#054f31` | |
| `signal-950` | `#032b1c` | |

### 2.3 Neutrals — "Ink" (navy‑tinted)

A cool, slightly navy‑tinted gray ramp so neutrals harmonize with Circuit Blue
instead of looking muddy. Anchored on the existing `--bg`/`--bg-soft`/`--border`/
`--fg`/`--fg-muted`.

| Token | Hex | Maps to existing | Use |
|---|---|---|---|
| `ink-50`  | `#f5f7fb` | — | text on light surfaces |
| `ink-100` | `#e7ecf5` | `--fg` | **primary text on dark** |
| `ink-200` | `#cdd6e7` | — | headings secondary |
| `ink-300` | `#b6c0d8` | — | |
| `ink-400` | `#9aa6c0` | `--fg-muted` | **muted/secondary text** |
| `ink-500` | `#6b769a` | — | placeholder, disabled |
| `ink-600` | `#4a5578` | — | hairlines on dark |
| `ink-700` | `#334066` | — | strong borders |
| `ink-800` | `#233052` | `--border` | **default border** |
| `ink-900` | `#11182e` | `--bg-soft` | **elevated surface / cards** |
| `ink-950` | `#0b1020` | `--bg` | **page background** |

### 2.4 Semantic colors

| Role | Token | Hex (on dark) | Notes |
|---|---|---|---|
| Info | `info` | `#4f7cff` | = `primary-500` |
| Success | `success` | `#32d583` | = `signal-400` (text) / `signal-600` (fill) |
| Warning | `warning` | `#fdb022` | amber‑400 |
| Danger | `danger` | `#f97066` | red‑400 for text on dark / `#d92d20` for fills |

Warning ramp (`amber`): `#fffaeb · #fef0c7 · #fedf89 · #fec84b · #fdb022 · #f79009 · #dc6803 · #b54708 · #93370d · #7a2e0e`
Danger ramp (`red`): `#fef3f2 · #fee4e2 · #fecdca · #fda29b · #f97066 · #f04438 · #d92d20 · #b42318 · #912018 · #7a271a`

### 2.5 Collaboration / presence palette

Multiplayer needs a set of **visually distinct, equally‑weighted** hues for
remote cursors, selection outlines, and avatar rings. These are *peers* (no
hierarchy) and must stay legible against the dark canvas. Assign deterministically
(e.g. `hash(userId) % 8`).

| # | Name | Hex |
|---|---|---|
| 1 | Indigo | `#818cf8` |
| 2 | Sky    | `#38bdf8` |
| 3 | Teal   | `#2dd4bf` |
| 4 | Green  | `#4ade80` |
| 5 | Amber  | `#fbbf24` |
| 6 | Orange | `#fb923c` |
| 7 | Rose   | `#fb7185` |
| 8 | Violet | `#c084fc` |

Rules:
- These are the **400‑weight** of their hue — bright enough to pop on `#0b1020`,
  not so saturated they vibrate.
- Cursor label chips: presence hex at full opacity, **black** (`#0b1020`) text
  for AA on these light hues.
- Selection halos: presence hex at `~30%` alpha for fills, full alpha for the 2px
  outline.
- Never use Circuit Blue (`primary-500`) as a presence color — it reads as "the
  app/you", not "a peer".

---

## 3. Typography

The site deliberately ships **zero client JS and no web fonts** (HTML + CSS only —
see `site/README.md`). Honor that: **default to the system UI stack** and only add
a web font if a measured branding win justifies the kilobytes.

### Families

```css
--font-sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial,
  sans-serif;                                   /* body + headings (current) */
--font-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code",
  "Cascadia Code", Menlo, Consolas, monospace;  /* code, file names, coords */
```

- **Sans** carries everything by default — matches the current site and stays
  asset‑free.
- **Mono** is a brand asset here, not just for code. Use it for file names
  (`board.kicad_pcb`), coordinates (`X 152.4 Y 96.0`), shortcuts, version strings,
  and stat numbers. It signals "engineering tool".
- *Optional upgrade:* if a display font is ever wanted, **Inter** (variable) for
  headings is the safe pick — but self‑host, subset, and `font-display: swap`.

### Type scale (`clamp()` for fluid headings, matches current hero)

| Token | Size | Line‑height | Use |
|---|---|---|---|
| `text-display` | `clamp(2.5rem, 6vw, 4rem)` | 1.05 | landing hero |
| `text-h1` | `clamp(2rem, 5vw, 3rem)` | 1.1 | page titles (current hero h1) |
| `text-h2` | `1.875rem` | 1.2 | section headings |
| `text-h3` | `1.375rem` | 1.25 | card titles |
| `text-lead` | `1.2rem` | 1.6 | hero subcopy (current `.lead`) |
| `text-base` | `1rem` | 1.6 | body (current default) |
| `text-sm` | `0.9rem` | 1.5 | footer, captions |
| `text-xs` | `0.8rem` | 1.4 | timestamps, labels |

Weights: `400` body · `600` emphasis/buttons/brand‑secondary · `700` brand/headings.
Body line‑height stays `1.6`; headings `1.1–1.25`. Cap measure at ~`44rem`
(`.prose`) / `42rem` (`.lead`) for readability.

---

## 4. Spacing, radius, elevation, motion

### Spacing
4px base scale (Tailwind default): `0.5/1/1.5/2/3/4/6/8/12/16/24 → 2px…96px`.
Section rhythm currently in use: `main { padding-block: 3rem }`, grid gap `1rem`,
card padding `1.25rem`. Keep these.

### Radius
```css
--radius-sm: 6px;     /* favicon square, chips, inputs */
--radius:    10px;    /* default — cards, buttons (current --radius) */
--radius-lg: 16px;    /* hero panels, modals */
--radius-full: 9999px;/* avatars, presence dots, pills */
```

### Borders
`1px solid var(--ink-800)` is the workhorse (current `--border`). Hairlines on
darker surfaces: `--ink-700`. Avoid pure‑black borders.

### Elevation (shadows — keep subtle; dark UI leans on borders + bg shifts)
```css
--shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);
--shadow-md: 0 4px 12px rgb(0 0 0 / 0.45);
--shadow-lg: 0 12px 32px rgb(0 0 0 / 0.5);
--shadow-glow: 0 0 0 3px rgb(79 124 255 / 0.35);  /* focus ring, primary-500 */
```

### Motion
- Durations: `--dur-fast: 120ms`, `--dur: 200ms`, `--dur-slow: 360ms`.
- Easing: `--ease: cubic-bezier(0.2, 0.8, 0.2, 1)` (standard), `--ease-out:
  cubic-bezier(0, 0, 0.2, 1)`.
- Hover affordance in use: `filter: brightness(1.08)` on the CTA — keep it.
- **Always** wrap non‑essential motion in `@media (prefers-reduced-motion: reduce)`.

### Breakpoints (Tailwind defaults)
`sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Content max‑width `64rem`
(`--max-width`, current).

### Z‑index ladder
`base 0 · dropdown 1000 · sticky-header 1020 · overlay 1030 · modal 1040 ·
presence-cursors 1050 · toast 1060 · tooltip 1070`.

---

## 5. Tailwind setup

The current site uses **plain CSS** (no Tailwind yet). When/if Tailwind is added,
use **Tailwind v4** (CSS‑first `@theme`, no JS config needed) since the site is
already on Astro 6 + Vite. A v3‑style `tailwind.config.js` is included below for
reference / if a JS config is preferred.

### 5.1 Tailwind v4 (recommended) — `@theme` in CSS

Install: `npm i tailwindcss @tailwindcss/vite` then add `@tailwindcss/vite` to
`astro.config.mjs` Vite plugins. Then in `src/styles/global.css`:

```css
@import "tailwindcss";

@theme {
  /* ---- Brand: Circuit Blue ---- */
  --color-primary-50:  #eef3ff;
  --color-primary-100: #dbe4ff;
  --color-primary-200: #bccdff;
  --color-primary-300: #93acff;
  --color-primary-400: #6b8eff;
  --color-primary-500: #4f7cff;
  --color-primary-600: #2f57f5;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1b357f;
  --color-primary-950: #131f54;

  /* ---- Signal Green (live / success) ---- */
  --color-signal-50:  #ecfdf3;
  --color-signal-100: #d1fadf;
  --color-signal-200: #a6f4c5;
  --color-signal-300: #6ce9a6;
  --color-signal-400: #32d583;
  --color-signal-500: #12b76a;
  --color-signal-600: #039855;
  --color-signal-700: #027a48;
  --color-signal-800: #05603a;
  --color-signal-900: #054f31;
  --color-signal-950: #032b1c;

  /* ---- Ink (navy-tinted neutrals) ---- */
  --color-ink-50:  #f5f7fb;
  --color-ink-100: #e7ecf5;
  --color-ink-200: #cdd6e7;
  --color-ink-300: #b6c0d8;
  --color-ink-400: #9aa6c0;
  --color-ink-500: #6b769a;
  --color-ink-600: #4a5578;
  --color-ink-700: #334066;
  --color-ink-800: #233052;
  --color-ink-900: #11182e;
  --color-ink-950: #0b1020;

  /* ---- Semantic aliases ---- */
  --color-bg:       var(--color-ink-950);
  --color-bg-soft:  var(--color-ink-900);
  --color-border:   var(--color-ink-800);
  --color-fg:       var(--color-ink-100);
  --color-fg-muted: var(--color-ink-400);
  --color-accent:   var(--color-primary-500);
  --color-success:  var(--color-signal-400);
  --color-warning:  #fdb022;
  --color-danger:   #f97066;

  /* ---- Presence (collaboration) ---- */
  --color-presence-1: #818cf8;
  --color-presence-2: #38bdf8;
  --color-presence-3: #2dd4bf;
  --color-presence-4: #4ade80;
  --color-presence-5: #fbbf24;
  --color-presence-6: #fb923c;
  --color-presence-7: #fb7185;
  --color-presence-8: #c084fc;

  /* ---- Type ---- */
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace;

  /* ---- Radius ---- */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
}
```

Usage in markup then reads naturally: `class="bg-bg text-fg border border-border"`,
`class="text-accent"`, `class="bg-primary-600 hover:bg-primary-700"`,
`class="text-presence-3"`.

### 5.2 Tailwind v3 (alternative) — `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,ts,md,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50:"#eef3ff",100:"#dbe4ff",200:"#bccdff",300:"#93acff",400:"#6b8eff",
          500:"#4f7cff",600:"#2f57f5",700:"#1d4ed8",800:"#1e40af",900:"#1b357f",950:"#131f54",
        },
        signal: {
          50:"#ecfdf3",100:"#d1fadf",200:"#a6f4c5",300:"#6ce9a6",400:"#32d583",
          500:"#12b76a",600:"#039855",700:"#027a48",800:"#05603a",900:"#054f31",950:"#032b1c",
        },
        ink: {
          50:"#f5f7fb",100:"#e7ecf5",200:"#cdd6e7",300:"#b6c0d8",400:"#9aa6c0",
          500:"#6b769a",600:"#4a5578",700:"#334066",800:"#233052",900:"#11182e",950:"#0b1020",
        },
        presence: {
          1:"#818cf8",2:"#38bdf8",3:"#2dd4bf",4:"#4ade80",
          5:"#fbbf24",6:"#fb923c",7:"#fb7185",8:"#c084fc",
        },
        // semantic
        bg: "#0b1020", "bg-soft": "#11182e", border: "#233052",
        fg: "#e7ecf5", "fg-muted": "#9aa6c0", accent: "#4f7cff",
        success: "#32d583", warning: "#fdb022", danger: "#f97066",
      },
      fontFamily: {
        sans: ["system-ui","-apple-system","Segoe UI","Roboto","Helvetica","Arial","sans-serif"],
        mono: ["ui-monospace","SF Mono","JetBrains Mono","Fira Code","Menlo","Consolas","monospace"],
      },
      borderRadius: { sm: "6px", DEFAULT: "10px", lg: "16px" },
      maxWidth: { content: "64rem", prose: "44rem" },
      boxShadow: {
        sm: "0 1px 2px rgb(0 0 0 / 0.4)",
        md: "0 4px 12px rgb(0 0 0 / 0.45)",
        lg: "0 12px 32px rgb(0 0 0 / 0.5)",
      },
    },
  },
  plugins: [],
};
```

### 5.3 Raw CSS variables (no Tailwind) — extends current `global.css`

If staying on hand‑written CSS, this is the drop‑in superset of the existing
`:root` block (existing names preserved; new ones added):

```css
:root {
  /* existing — unchanged */
  --bg: #0b1020;
  --bg-soft: #11182e;
  --fg: #e7ecf5;
  --fg-muted: #9aa6c0;
  --accent: #4f7cff;
  --border: #233052;
  --max-width: 64rem;
  --radius: 10px;

  /* added — full scales available as --primary-600 etc. (see §5.1) */
  --primary-600: #2f57f5;
  --primary-700: #1d4ed8;
  --success: #32d583;
  --warning: #fdb022;
  --danger:  #f97066;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --radius-sm: 6px;
  --radius-lg: 16px;
}
```

---

## 6. Components (tokens & rules)

Built from the current `global.css` patterns; tightened for AA contrast.

### Buttons
| Variant | bg | text | hover |
|---|---|---|---|
| **Primary** | `primary-600` (`#2f57f5`) | `#fff` | `primary-700` |
| **Secondary** | transparent, `1px` `ink-700` border | `fg` | bg `ink-900` |
| **Ghost** | transparent | `fg-muted` → `fg` | underline / bg wash |
| **Success** | `signal-600` | `#fff` | `signal-700` |

Shared: `padding: 0.7rem 1.25rem` · `border-radius: var(--radius)` ·
`font-weight: 600` · focus → `--shadow-glow`. *(Note: current `.cta` uses
`--accent` `#4f7cff`; bump to `primary-600` for AA on white text.)*

### Cards (current `.card`)
`background: bg-soft` · `1px ink-800 border` · `radius 10px` · `padding 1.25rem`.
Hover (if interactive): border → `ink-700`, subtle `--shadow-md`.

### Links
Default `accent` (`primary-500`), underline on hover. In dense UI/nav, use
`fg-muted` → `fg` on hover with no underline (current `.nav` pattern).

### Inputs
bg `bg`/`ink-950`, border `ink-700`, text `fg`, placeholder `ink-500`,
focus border `primary-500` + `--shadow-glow`, radius `--radius-sm`.

### Presence avatars / cursors
- Avatar: `radius-full`, 2px ring in the user's presence color, initials in mono.
- Stack overflow: "+N" chip in `ink-800` / `fg-muted`.
- Live cursor: SVG arrow in presence color + name chip (presence bg, `#0b1020`
  text). Smooth‑interpolate motion; respect reduced‑motion (snap instead).
- "Online" dot: `signal-400` filled circle, optional soft pulse.

### Badges / pills
`radius-full`, `text-xs`, `font-weight 600`. Status mapping: live=`signal`,
beta/new=`primary`, warning=`amber`, deprecated/error=`red`. Tinted style: text in
hue‑400, bg in hue‑hue at ~12% alpha.

---

## 7. Imagery, motifs & iconography

- **Blueprint grid.** A faint dot/line grid (`ink-800` at low alpha over `bg`) as
  a section or hero background reads instantly as "schematic/PCB canvas". Keep it
  subtle — it's texture, not content.
  ```css
  background-image: radial-gradient(var(--ink-800) 1px, transparent 1px);
  background-size: 24px 24px;
  ```
- **Traces.** Decorative right‑angle / 45° routed lines in `primary-500` (low
  alpha) evoke copper routing. Use sparingly as accents, never behind text.
- **Real screenshots > illustrations.** Show the actual board editor with real
  copper, pads, and (especially) **multiple cursors** — that single image
  communicates "real KiCad + collaboration" better than any copy.
- **Icons:** line/stroke style (Lucide‑like), `1.5–2px` stroke, `currentColor`,
  rounded joins. Consistent 24px grid.
- **Code/file chips** in mono are a first‑class visual element (see §3).

---

## 8. Accessibility

- **Target WCAG AA.** Body text ≥ 4.5:1, large text/UI ≥ 3:1.
  - ✅ `fg` on `bg`, `fg-muted` on `bg`, `accent` on `bg`.
  - ⚠️ white on `primary-500` fails for body — use `primary-600`+ (see §2.1).
- **Focus visible always.** Use `--shadow-glow` ring; never remove outlines
  without a replacement.
- **Don't encode meaning in color alone.** Presence colors pair with names/initials;
  status badges pair with text; DRC/errors pair with an icon.
- **Reduced motion.** Honor `prefers-reduced-motion` for cursor smoothing, pulses,
  and any hero animation.
- **Hit targets** ≥ 44×44px for touch.

---

## 9. Light mode (optional, future)

The brand is dark‑first (matches both the marketing site and the EDA canvas).
If a light theme is added later, flip neutrals and keep brand hues:

```css
@media (prefers-color-scheme: light) {
  :root {
    --bg: #ffffff; --bg-soft: #f5f7fb; --border: #cdd6e7;
    --fg: #11182e; --fg-muted: #4a5578;
    --accent: #2f57f5;            /* use 600 for AA on white */
  }
}
```
Defer until there's demand; don't split design effort prematurely.

---

## 10. Logo & attribution

- **Current mark:** rounded‑square (`radius 6px`) in `#1d4ed8` (`primary-700`)
  with a white "K" monogram — see `site/public/favicon.svg`. Treat as a
  placeholder app icon; safe to evolve, but keep: rounded square + blue + simple
  glyph.
- **Clear space:** ≥ 25% of the mark's width on all sides.
- **Minimum size:** 16px (favicon) / 24px (UI). Below that, drop detail.
- **On color:** mark on `bg`/`bg-soft` only, or white mark on `primary-700`. Don't
  place the blue mark on busy/low‑contrast backgrounds.
- **KiCad attribution (important):** This product builds on the open‑source KiCad
  project. Do **not** use the official KiCad logo as *our* logo or imply
  endorsement. State the relationship plainly ("Powered by KiCad" / "Built on the
  open‑source KiCad EDA suite") and respect KiCad's trademark/branding guidelines.
  When in doubt, attribute and link to kicad.org.

---

## 11. Quick reference (copy/paste)

```
PALETTE
  Primary  (Circuit Blue)  brand 500 #4f7cff · button 600 #2f57f5 · favicon 700 #1d4ed8
  Signal   (Green/live)    text 400 #32d583 · fill 600 #039855
  Ink      (neutrals)      bg 950 #0b1020 · surface 900 #11182e · border 800 #233052
                           text 100 #e7ecf5 · muted 400 #9aa6c0
  Status   warning #fdb022 · danger #f97066
  Presence #818cf8 #38bdf8 #2dd4bf #4ade80 #fbbf24 #fb923c #fb7185 #c084fc

TYPE      sans = system-ui stack · mono = ui-monospace stack (file names/coords/stats)
RADIUS    6 / 10 / 16 / full          MAX-W   content 64rem · prose 44rem
MOTION    120 / 200 / 360ms · ease cubic-bezier(0.2,0.8,0.2,1)

RULES
  • White button text → primary-600+, not 500 (AA).
  • Green = connected/success/live. Blue = brand/you/app. Presence hues = peers.
  • Dark-first. Zero web fonts by default (HTML+CSS only — keep the site light).
  • "Powered by KiCad" — attribute, don't appropriate.
```
