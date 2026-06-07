# Astro templates & component libraries — tooling survey for the kicad-wasm site

**Scope:** Modern, popular **Astro** landing-page templates and component/UI libraries that are
simple to set up and give a beautiful design skeleton out of the box — free *and* paid — chosen for
the **kicad-wasm** marketing site (a WebAssembly browser port of KiCad; a technical EDA / dev-tool).

**Date:** 2026-06-07 · **Companion to:** `brand-guide.md`, `marketing-site-playbook.md`,
`landing-page-best-practices.md` (this file is the *implementation-tooling* layer — what to build the
skeleton **with**; the others cover brand, content/CRO, and competitive positioning).

> ### ⚠️ Read this first — the site already exists
> `site/` is **already an Astro `^6.4.4` project**: `output: 'static'`, `@astrojs/vercel` adapter,
> `prefetch` on, with a **hand-rolled CSS design system** (`src/styles/global.css` — CSS custom
> properties, dark theme: `--bg:#0b1020`, `--accent:#4f7cff`, `--radius:10px`). It has
> `BaseLayout`, `Header`, `Footer`, `index`, a `blog/` collection, and legal pages.
> **Tailwind is NOT installed.** So this is *not* a greenfield "pick a template" decision — most of
> the libraries below are Tailwind-based, which makes **§7 Decision 0 (adopt Tailwind, or stay
> CSS-only?)** the real fork in the road. Don't scaffold a fresh template *over* the working site;
> the templates below are best used as **block-harvest references**, not a foundation to overwrite.

**Methodology:** deep-research harness — 5 search angles → 22 sources fetched → 101 candidate claims
→ top 25 adversarially fact-checked (3 skeptics each, 2/3 to kill). 24 confirmed, 1 refuted. Stars /
versions / prices are point-in-time (June 2026) and will drift — re-verify before buying/pinning.

**Confidence legend:**

| Marker | Meaning |
|---|---|
| ✅ | Verified 3-0 against primary sources this run |
| ⚠️ | Verified with a caveat (2-1 vote, or a soft/vendor-reported sub-claim) |
| 📋 | Established ecosystem fact, included for breadth; not independently re-verified this run |
| ❌ | Tested and **refuted** — do not rely on it |

---

## TL;DR for kicad-wasm

1. **You already have an Astro site, not a blank slate.** The highest-leverage move is
   **`npx astro add tailwind`** on the existing `site/`, then layer a component library on top —
   *not* replacing `global.css` with a whole new template.
2. **Best free component layer once Tailwind is in: [daisyUI](https://daisyui.com)** ✅ — 65
   components, 35 themes, config-free v5 install, semantic classes that coexist with your CSS-var
   tokens. Its `mockup-window` / `mockup-code` / `mockup-browser` components are perfect for framing
   the live WASM demo and CLI snippets.
3. **Best paid: [Tailwind Plus](https://tailwindcss.com/plus)** ✅ ($299 one-time) — 500+ components
   in **vanilla HTML**; paste Marketing blocks (hero, pricing, features, FAQ) straight into `.astro`
   and recolor to your tokens. Best ROI of any paid option here.
4. **Best template to mine for blocks (free): [AstroWind](https://github.com/arthelokyo/astrowind)**
   ✅ — most-starred Astro theme (~5.7k★), MIT, **Astro v6 + Tailwind v4 (matches your Astro 6.4)**.
   Copy individual widget components (Hero, Features, Pricing, FAQ) rather than adopting wholesale.
5. **Code blocks:** add **[Expressive Code](https://expressive-code.com)** ✅ for install/usage
   snippets (copy button, titles, highlighting) — table-stakes for a dev tool.
6. **Stay light:** the page will host a heavy WASM demo. **Prefer zero-JS Astro/Tailwind + CSS/GSAP
   over React islands.** React component libs (shadcn/Magic UI/Aceternity) are optional flair only.

---

## 1. Landing-page templates / themes

A *template/theme* is a whole-page skeleton (hero, features, pricing, footer, config). Fastest path
to "beautiful out of the box" — **but** since `site/` already exists, treat these as **reference /
block sources** (MIT lets you copy individual components) unless you decide to restart from one.

### Free / open-source

| Template | Stars / forks | Stack | License | Maintenance | Notes |
|---|---|---|---|---|---|
| **[AstroWind](https://github.com/arthelokyo/astrowind)** ✅ | ~5.7k ★ / ~1.6k forks — **most-starred Astro theme** | Astro ^6.4 + Tailwind ^4.3 | MIT | **Active** — beta.60 (May 11 2026), Astro v6 + TW v4 migration done, v2.0 planned, Node ≥22.12 | Astro version **matches your `site/`**. Ships hero/feature/pricing/FAQ/footer widgets + SEO/RSS/sitemap/OG wired. Best mined for individual `~/components/widgets/*`. Org renamed `onwidget`→`arthelokyo` (old URLs redirect; npm still `@onwidget/astrowind`). |
| **[Astroship](https://github.com/surjithctly/astroship)** 📋 | popular | Astro + Tailwind | MIT | Maintained (Web3Templates) | Clean SaaS/startup marketing skeleton. Has a paid **Astroship Pro** with more pages/blocks. |
| **[mhyfritz/astro-landing-page](https://github.com/mhyfritz/astro-landing-page)** ✅ | 675 ★ / 224 forks | Astro + Tailwind | MIT | ⚠️ **Stale** — last push 2024-11-24 (~18 mo), not archived | Simpler single-page template; dark mode, responsive, a11y, SEO, OG, CSS-var theming. Deps likely need manual upgrade. |
| **[RicoUI SaaS Template](https://github.com/ricocc/ricoui-saas-template)** ✅ | OSS | Astro 6 + Tailwind v4 | OSS (MIT-style) | Current | Free SaaS landing in the official directory; demo `ricofast.pages.dev`. |
| **ProCleaning** ✅ | — | Astro + Tailwind | free in directory | — | Example free responsive landing listed in the Astro directory. |
| **[Astro Paper](https://github.com/satnaing/astro-paper)** 📋 | ~4.7k ★ | Astro + Tailwind | MIT | Active | Blog-first (#2 most-starred Astro theme). Relevant for the `blog/` you already have. |
| **[Astroplate](https://github.com/zeon-studio/astroplate)** 📋 | ~1.1k ★ | Astro + Tailwind | MIT | Active | Starter with blog + pages. |

> ✅ AstroWind is independently confirmed **#1 by stars** on the `astro-themes` topic (5.7k, ahead of
> Astro Paper 4.7k, Astroplate 1.1k), and its SEO claims are verified **at the source-code level**:
> `package.json` really lists `@astrojs/sitemap`, `@astrojs/rss`, `astro-seo`, and `astro.config.ts`
> calls `sitemap()`.

### Paid / premium

| Vendor / product | Price | Stack | Notes |
|---|---|---|---|
| **[Tailwind Plus](https://tailwindcss.com/plus)** ✅ (ex–Tailwind UI) | **$299** personal / **$979** team (≤25), **one-time, lifetime, no subscription**, 30-day refund | Tailwind — vanilla HTML + React + Vue | Not one theme — a 500+ component library incl. Marketing blocks + full Landing-Page examples. **The recommended paid pick** (see §3). |
| **[Cruip](https://cruip.com)** 📋 | free + premium | Tailwind (HTML/React); Astro ports exist | Very polished startup/SaaS landing templates; some free, flagship paid. Classic "looks-expensive" pick. |
| **[Lexington Themes](https://lexingtonthemes.com)** ⚠️ | per-theme + **Full Access** | Astro + Tailwind | Large Astro marketing/SaaS catalog. Confirmed as paid/all-access in the directory; exact bundle price not verified this run. |
| **[Cosmic Themes](https://cosmicthemes.com)** ⚠️ | per-theme + **All Access** | Astro + Tailwind | Astro-specialist studio; SaaS/landing themes, i18n, blog. Paid confirmed; price not verified this run. |
| **AstroVault / Zarex / Fortify Astro** ⚠️ | paid / all-access | Astro + Tailwind | Additional premium Astro vendors in the directory. Existence-as-paid confirmed; pricing/license **not** individually verified. |
| **ThemeForest / Lemon Squeezy / Gumroad** 📋 | one-off (~$15–$60 typical) | mostly Astro + Tailwind | Many Astro landing themes; quality/maintenance vary — check last-updated + reviews. |

### Official Astro themes directory — the browsing entry point ✅

**<https://astro.build/themes/?categories[]=landing-page>** — canonical first-party catalog.
- Dedicated **"Landing pages"** category: *"Showcase your product or service with a stylish landing
  page template."*
- **23 pages** of landing-page-tagged themes (~20/page), with a **Free vs Paid pricing filter**. ✅
- Caveat: size proves quantity, not curation quality — vet each theme's maintenance.

---

## 2. Astro-native / Astro-first component & UI libraries

Building blocks as **native `.astro` components or plain Tailwind** — **no React island**, zero added
client JS by default. Best fit for a page that also carries a heavy WASM demo.

| Library | What it is | Status | Astro fit | License |
|---|---|---|---|---|
| **[Accessible Astro Components](https://github.com/incluud/accessible-astro-components)** ✅ | 35+ native `.astro` components: Accordion, Breadcrumbs, Card, Pagination, Tabs, Modal, Notification, DarkMode toggle, form fields | npm v5.3.1, active | `import { Modal } from 'accessible-astro-components'` — **zero framework integration**, works with or without Tailwind | MIT |
| **[Starwind UI](https://github.com/starwind-ui/starwind-ui)** 📋 | shadcn-style copy-in components **built for Astro** (Tailwind v4), accessible, themeable | Active | Native Astro; CLI adds components to your tree. The shadcn workflow **without React** | open-source |
| **[Preline UI](https://preline.co/docs/frameworks-astro.html)** ✅ | Large Tailwind component lib with an **official Astro install guide** + interactive overlays/dropdowns/tabs via its JS plugin | ~6.3k ★, v4.2.0 (2026-05-10), active | First-class Astro; **requires Tailwind first** (architectural dependency) | free, OSS (Apache-2.0) |
| **[Flowbite](https://flowbite.com)** 📋 | Tailwind components + marketing blocks; Astro usage docs | ~8k★+, active | Works in Astro via its JS for interactive bits | MIT core; some blocks paid |
| **Accessible Astro Starter / Dashboard** 📋 | Full starter projects from the `incluud` team | Active | Complete bases pairing with the components above | MIT |

> ⚠️ **Refuted — don't repeat:** the stronger claim that Accessible Astro Components are
> *"WCAG-compliant with comprehensive accessibility audits"* did **not** survive verification (1-2).
> They're *accessible-by-design* (good ARIA/markup), but make no formal-audit/certification claim.

---

## 3. Tailwind-based component libraries usable in Astro (framework-agnostic HTML)

Astro renders plain HTML natively, so any **copy-paste Tailwind HTML** library works with **zero
integration** (once Tailwind is installed — see §7 Decision 0). The sweet spot for a fast, light
dev-tool page.

| Library | Price | What you get | Astro install | Verified |
|---|---|---|---|---|
| **[Tailwind Plus](https://tailwindcss.com/plus)** | $299 / $979 one-time | **500+ components**; Marketing: Hero (12), CTA (11), Pricing (12), Stats (8), Testimonials (8), Team (9), FAQs (7), Footers (7), Flyout Menus (7), 404 (5), Landing Pages (4 full), About (3). In **vanilla HTML** + React + Vue | Paste HTML into `.astro`. `@tailwindplus/elements` (CDN `<script type=module>`) adds headless interactive Dialog/Dropdown/Select/Tabs/Popover **with no JS framework** | ✅ pricing, counts, vanilla-HTML, Elements all 3-0 |
| **[daisyUI](https://daisyui.com)** | Free (MIT) | **65 components** (Actions 6, Data Display 17, Navigation 8, Feedback 7, Data Input 14, Layout 8, Mockup 4); **35 themes** + generator; `data-theme` dark switching; ~19M npm installs | `npm i tailwindcss @tailwindcss/vite daisyui` + `@import "tailwindcss"; @plugin "daisyui";` — **config-free in v5** (also add `tailwindcss()` to Vite plugins + import CSS) | ✅ components/themes/install all 3-0 |
| **[Preline UI](https://preline.co)** | Free | 800+ components/examples, marketing blocks | Official Astro guide (§2) | ✅ |
| **[HyperUI](https://www.hyperui.dev)** 📋 | Free (MIT) | Open-source copy-paste Tailwind components incl. **marketing** + app + e-commerce | Paste HTML; no JS for most | 📋 |
| **[Flowbite Blocks](https://flowbite.com/blocks/)** 📋 | free + paid | Marketing/section blocks | Paste HTML | 📋 |
| **[Meraki UI](https://merakiui.com)** 📋 | Free | Beautiful Tailwind components, RTL | Paste HTML | 📋 |
| **[Float UI](https://floatui.com)** 📋 | free + paid | Modern landing-page sections | Paste HTML | 📋 |
| **[Tailblocks](https://tailblocks.cc)** 📋 | Free (MIT) | Ready-to-use blocks (hero, feature, pricing, CTA) | Paste HTML | 📋 |
| **[Cruip Tailwind components](https://cruip.com)** 📋 | free + paid | Polished landing sections | Paste HTML | 📋 |
| **Kometa / Kutty / Sailboat UI / TailGrids** 📋 | mixed | More Tailwind block collections worth a look | Paste HTML | 📋 |

**Tradeoff:** copy-paste HTML costs nothing at runtime but you own the markup (no upstream updates).
Component *packages* (daisyUI, Preline) update via npm but add a dependency + their JS for interactivity.

---

## 4. React-island component libraries (visual flair) — and the tradeoffs

These are **React** libraries. In Astro they require the React integration + explicit hydration,
shipping a React runtime + component JS to the browser. Use **deliberately and sparingly** here.

| Library | Stars / size | For | Astro requirement | Verified |
|---|---|---|---|---|
| **[shadcn/ui](https://ui.shadcn.com/docs/installation/astro)** | de-facto standard | Radix + Tailwind + CVA primitives; **copy-paste into your tree** (`shadcn add card` → `@/components/ui/`), you own the code (not an npm dep) | `npx astro add react tailwind`; hydrate `client:load/visible/idle` | ✅ both claims 3-0 |
| **[Magic UI](https://magicui.design)** | ~21.2k ★, MIT | **150+ animated** components/effects (React + TS + Tailwind + Motion); companion to shadcn/ui | `npx astro add react` + `shadcn init` | ✅ 3-0 (150+ vendor-reported) |
| **[Aceternity UI](https://ui.aceternity.com)** | popular | **200+** copy-paste components/blocks/templates, Framer Motion; *"ship landing pages at lightning speed"* — Hero (21+), Feature (18+), Testimonials (7+), Pricing (6+), CTA (6+), animated Backgrounds (11+) | React island + Framer Motion | ✅ 3-0 (200+ vendor-reported) |
| **[Tremor](https://tremor.so)** 📋 | popular | React **dashboard/chart** components — not landing-oriented, but useful for live metrics | React island | 📋 |
| **[React Bits](https://reactbits.dev) / [Cult UI](https://cult-ui.com) / [Origin UI](https://originui.com)** 📋 | growing | More shadcn-style animated React collections | React island | 📋 |

### The Astro React-island tradeoff (acute for kicad-wasm) ✅
- **Cost:** each hydrated React component ships React + its JS and runs client-side. On a page that
  *also* instantiates a multi-MB WASM KiCad module, that competes for parse/compile/main-thread time
  and can hurt Lighthouse/PageSpeed.
- **Mitigations:** prefer `client:visible`/`client:idle` over `client:load`; isolate React flair to a
  small below-the-fold section; keep hero + above-the-fold zero-JS.
- **Open question (unbenchmarked):** the *measured* impact of React islands + Framer Motion alongside
  the WASM payload was **not** profiled in this research — measure before committing.
- **Verdict:** treat Aceternity/Magic UI as optional spice, not the foundation. Get similar "wow"
  from CSS/GSAP/Motion One (§5) without a React runtime.

---

## 5. Animation / motion options that work in Astro

| Option | Type | Astro fit | Use for |
|---|---|---|---|
| **CSS** (transitions, keyframes, scroll-driven animations) | Zero-JS | Native, free | Default — hover/reveals/gradients, no bundle cost. Pairs with your existing CSS-var system. |
| **Astro View Transitions** (`<ClientRouter />`) 📋 | Built-in | Native | Smooth page-to-page transitions, near-zero code. (You already have `prefetch` on — natural fit.) |
| **[GSAP](https://gsap.com)** 📋 | Vanilla JS | `<script>` in `.astro` | Complex timelines / scroll-triggered hero — **no React**. Now fully free incl. all plugins. |
| **[Motion (Motion One)](https://motion.dev)** 📋 | Vanilla JS (also React) | `<script>` in `.astro` | Tiny (~few KB) Web Animations API wrapper; vanilla alternative to Framer Motion. |
| **[AOS](https://michalsnik.github.io/aos/)** 📋 | Vanilla JS | npm + init | Quick scroll-reveal via data attributes; lowest effort. |
| **Framer Motion / Motion for React** 📋 | React | React island | Only if already committed to React (Magic UI / Aceternity depend on it). |
| **[Lottie](https://lottiefiles.com) (`lottie-web`)** 📋 | Vanilla JS | `<script>` / web component | Designer JSON animations (animated logo, "routing traces" motif). |

> **For kicad-wasm:** CSS + GSAP/Motion One deliver premium motion with no React runtime — keeping
> the page light next to the WASM editor.

---

## 6. Icons, fonts, code blocks & SEO/perf tooling

### Icons
- **[astro-icon](https://github.com/natemoo-re/astro-icon)** 📋 — Astro icon component using
  **[Iconify](https://iconify.design)** sets (200k+ icons: `lucide`, `tabler`, `mdi`,
  `simple-icons` for brand logos). SVGs inlined at build → zero runtime JS.
- **[Lucide](https://lucide.dev)** 📋 — clean popular open-source set (also via Iconify).

### Fonts
- **[Fontsource](https://fontsource.org)** 📋 — self-host open fonts via npm; no external request,
  better privacy/perf/CLS. (Your `global.css` currently uses `system-ui` stack — fine, but a self-
  hosted display face would lift the brand.)
- **[Astro Fonts API](https://docs.astro.build/en/reference/experimental-flags/fonts/)** 📋 —
  built-in font optimization (`experimental.fonts`) for self-hosting + preloading.

### Code blocks (matters for a dev tool — install/usage snippets)
- **[Expressive Code](https://expressive-code.com)** ✅ — Astro/Starlight-grade code blocks: Shiki
  highlighting, line numbers/highlighting, titles/frames, copy button, diff markers. Installs as an
  Astro integration. Ideal for `npm`/CLI install + KiCad script examples. **Recommended.**
- **[Shiki](https://shiki.style)** 📋 — Astro's default Markdown/MDX highlighter.

### SEO / performance
- **[@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/)** ✅ —
  official; auto-generates `sitemap-index.xml` + `sitemap-0.xml` at build by crawling static routes
  (incl. dynamic `getStaticPaths()` routes). *(You're `output: 'static'` — perfect fit; bundled in
  AstroWind.)*
- **[@astrojs/rss](https://docs.astro.build/en/recipes/rss/)** ✅ — official RSS builder. *(You
  already have a `blog/` collection — wire this up.)*
- **[astro-seo](https://github.com/jonasmerlin/astro-seo)** ✅ — `<meta>`, Open Graph, Twitter cards.
- **Built-in Astro perf:** static HTML, partial hydration (islands), `<Image />` optimization, asset
  bundling — Astro's zero-JS-by-default model is the biggest perf lever for a content site.
- **`@astrojs/partytown`** 📋 — offload third-party scripts (analytics) to a web worker so they
  don't block the main thread — relevant when the main thread is busy with WASM.

---

## 7. Concrete recommendation for the kicad-wasm landing page

### Decision 0 — RESOLVED: use Tailwind ✅

> **Decided (2026-06-07): the project will use Tailwind.** `site/` currently uses **hand-rolled CSS**
> (custom properties, dark theme) with **no Tailwind**, so the concrete next step is to **add Tailwind
> to the existing site** rather than re-scaffold. The CSS-only path below is kept only for reference.

**Step 1 — add Tailwind to the existing `site/`** (Astro 6 + Tailwind v4 via the Vite plugin):

```bash
cd site
npx astro add tailwind        # wires @tailwindcss/vite into astro.config.mjs
```

Then in `src/styles/global.css` add Tailwind on top of your existing tokens:

```css
@import "tailwindcss";
/* your existing :root { --bg; --accent; ... } stays — it's the source of truth */
@plugin "daisyui";            /* once daisyUI is installed (step 2) */
```

**Step 2 — map your existing tokens to a daisyUI theme** so hand-written + library components share
one palette. Define a custom daisyUI theme whose `--p`/`--b1`/etc. resolve to your `--accent:#4f7cff`,
`--bg:#0b1020`, `--radius:10px`. Keep `global.css` `:root` as the single source of truth.

> Net effect: Tailwind v4 **coexists with** your current CSS rather than replacing it, and unlocks
> daisyUI + Tailwind Plus + AstroWind block-harvesting with minimal churn.

<details><summary>Reference only — the rejected CSS-only path</summary>

Keep `global.css`; hand-build sections (optionally copying HTML structure from HyperUI / Tailblocks /
AstroWind and converting utility classes to your CSS). Use **Accessible Astro Components** (works
without Tailwind) for interactive bits. Rejected because it costs medium effort per section (manual
restyling) and forgoes the daisyUI / Tailwind Plus ecosystem.

</details>

### Recommended stack (Tailwind path)

- **Foundation:** keep the **existing `site/` Astro project** (Astro 6.4, static, Vercel). Do **not**
  re-scaffold from a template — instead **mine AstroWind** ✅ (same Astro v6 + Tailwind v4) for
  individual Hero/Features/Pricing/FAQ widget markup and adapt to your tokens.
- **Component layer (free):** **daisyUI** ✅ — themeable buttons/cards/badges/navbar, and crucially
  `mockup-window` / `mockup-code` / `mockup-browser` to frame the **live WASM demo** and CLI
  snippets. Add **Accessible Astro Components** ✅ / **Preline** ✅ for accessible modal/tabs/accordion
  without React.
- **Component layer (paid, optional):** **Tailwind Plus** ✅ ($299 one-time) if you want pro-grade
  Marketing sections fast — paste vanilla-HTML hero/pricing/feature blocks and recolor. Best paid ROI.
- **Code blocks:** **Expressive Code** ✅ — install/usage snippets with copy button + highlighting.
- **Animation:** **CSS + GSAP or Motion One** (vanilla). *Avoid* React-island animation libs as the
  base; optionally one Aceternity/Magic UI section `client:visible` for a marquee effect.
- **Icons/fonts:** **astro-icon** + Iconify (`lucide`, `simple-icons` for GitHub/Discord);
  self-host a display font via **Fontsource** / Astro Fonts API to lift the brand above `system-ui`.
- **SEO/perf:** **@astrojs/sitemap** ✅ + **astro-seo** ✅ + **@astrojs/rss** ✅ (you already have a
  blog); **partytown** for analytics so it doesn't fight the WASM main thread.

### Best paid option, and when it's worth it
- **Tailwind Plus ($299 one-time)** ✅ — buy if you want top-tier section designs fast and will reuse
  them site-wide; composes *with* your existing site rather than replacing it.
- **A premium Astro theme** (Cosmic / Lexington "All Access") ⚠️ — only if you'd rather *restart* from
  a complete polished SaaS theme than layer onto `site/`. Verify per-bundle price/license first.

### Decision shortcuts
- *Ship this week, $0:* add Tailwind + **daisyUI** + **Expressive Code** to `site/`, harvest AstroWind
  blocks. ← **default**
- *Bespoke look, small budget:* same + **Tailwind Plus** Marketing blocks.
- *Turnkey premium SaaS look, willing to restart:* a **Cosmic/Lexington** Astro theme (verify price).
- *Flashy animated hero:* one Aceternity/Magic UI React island (`client:visible`), or **GSAP** to
  avoid React.

### kicad-wasm-specific build notes
- **Hero = live demo, not just a screenshot.** Reserve a slot to embed the interactive WASM editor
  (iframe/canvas). Lazy-init it (`client:visible` / IntersectionObserver) so it doesn't block first
  paint. *(Which template gives the cleanest hero slot for this was flagged as an open question — see
  below.)*
- **Dark mode is expected by devs** — your `global.css` is already dark-first; daisyUI's `dark`
  theme or a `data-theme` toggle slots in cleanly.
- **Keep the marketing page's JS budget tiny** because the demo's WASM payload is the heavy part.

---

## 8. Caveats & open questions

**Caveats**
- **Time-sensitive (June 2026):** AstroWind ~5.7k★/Astro v6/TW v4, Preline v4.2.0, Magic UI ~21.2k★,
  daisyUI 5, Tailwind Plus $299/$979. Re-verify before buying/pinning.
- **Vendor-reported counts:** "150+" (Magic UI), "200+" (Aceternity), "professionally designed"
  (Tailwind Plus) are vendors' own figures; qualitative facts (free/OSS, stack, copy-paste) verified,
  exact counts not independently re-counted.
- **Perf is content-dependent:** AstroWind's "production-ready PageSpeed" depends on *your* images
  and — here — the WASM payload. Not guaranteed; measure.
- **Stale template:** `mhyfritz/astro-landing-page` — no commits since 2024-11-24; expect manual dep
  upgrades.
- **MIT ≠ no obligations:** AstroWind, mhyfritz, Magic UI, RicoUI still require retaining the
  copyright/license notice (trivial, but it exists).
- **Premium Astro bundles** (Lexington, Cosmic, AstroVault, Zarex, Fortify) confirmed only to *exist
  as paid/all-access* — exact prices and license terms (single-site vs unlimited, commercial) **not**
  individually verified.
- **❌ Refuted:** Accessible Astro Components are accessible-by-design but **not** formally WCAG-
  audited/certified — don't claim otherwise.

**Open questions worth resolving before committing**
1. Exact prices/license terms of premium Astro bundles (Lexington / Cosmic / AstroVault / Zarex /
   Fortify) and which ship a real dev-tool/SaaS landing template.
2. Measured impact of React islands + Framer Motion **combined with** the heavy WASM demo on
   load/PageSpeed — needs a real benchmark on this project.
3. Non-React animation bundle sizes (GSAP vs Motion One vs AOS vs CSS) vs the Aceternity/Magic UI
   React-island route.
4. Which approach gives the cleanest **hero slot to embed the interactive WASM demo** (iframe/canvas)
   vs only a static screenshot, and the effort to wire lazy init.

---

## 9. Sources

Primary (fetched & verified this run):
- AstroWind — <https://github.com/arthelokyo/astrowind> · <https://github.com/onwidget/astrowind>
- Astro themes topic ranking — <https://github.com/topics/astro-themes>
- Astro official themes directory — <https://astro.build/themes/?categories[]=landing-page>
- mhyfritz/astro-landing-page — <https://github.com/mhyfritz/astro-landing-page> (+ GitHub API)
- RicoUI SaaS Template — <https://github.com/ricocc/ricoui-saas-template>
- Astroship — <https://github.com/surjithctly/astroship>
- Tailwind Plus — <https://tailwindcss.com/plus> · marketing blocks <https://tailwindcss.com/plus/ui-blocks/marketing> · vanilla-JS blog <https://tailwindcss.com/blog/vanilla-js-support-for-tailwind-plus>
- daisyUI — <https://daisyui.com> · Astro install <https://daisyui.com/docs/install/astro/> · components <https://daisyui.com/components> · themes <https://daisyui.com/docs/themes/> · repo <https://github.com/saadeghi/daisyui>
- Preline UI — Astro guide <https://preline.co/docs/frameworks-astro.html> · repo <https://github.com/htmlstreamofficial/preline>
- Accessible Astro Components — <https://github.com/incluud/accessible-astro-components> · <https://accessible-astro.incluud.dev>
- Starwind UI — <https://github.com/starwind-ui/starwind-ui>
- shadcn/ui (Astro) — <https://ui.shadcn.com/docs/installation/astro> · <https://ui.shadcn.com/docs>
- Magic UI — <https://magicui.design> · Astro install <https://v3.magicui.design/docs/installation/astro> · repo <https://github.com/magicuidesign/magicui>
- Aceternity UI — <https://ui.aceternity.com> · components <https://ui.aceternity.com/components>
- @astrojs/sitemap — <https://docs.astro.build/en/guides/integrations-guide/sitemap/>
- Expressive Code — <https://expressive-code.com/installation/>
- Tailwind Plus pricing corroboration — <https://landinggo.com/blog/tailwind-ui-pricing>

Secondary / blog (context): pkgpulse Aceternity-vs-Magic-vs-shadcn comparison; dev.to shadcn-like
collections; adminlte.io premium Astro templates; npmtrends/daisyui.

---

*Generated by the deep-research harness: 5 angles · 22 sources fetched · 101 claims extracted · 25
adversarially verified (24 confirmed, 1 refuted) · 104 agents. Tailored against the real `site/`
Astro project state. Re-run before purchasing to refresh prices/versions/stars.*
