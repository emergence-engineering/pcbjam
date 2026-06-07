# Landing Page & Adjacent Pages Playbook

> **Product context:** a browser-based, collaborative PCB/EDA design tool — KiCad compiled to WebAssembly, running entirely in the browser, with real-time multiplayer collaboration ("Figma/Google-Docs for PCB design"). Open-source engine, commercial collaboration/cloud layer.
>
> **What this is:** an exhaustive, opinionated reference for the entire *marketing/adjacent* surface of the product — homepage, feature/use-case/comparison/integration pages, pricing, templates gallery, blog, careers, community, trust/legal, plus the SEO/GEO/CRO/performance disciplines that make them work. It is written to be tailored to *this* product, not a generic SaaS.
>
> **Audience for this doc:** whoever builds and owns the marketing site, docs site, content, and growth. Engineers, founders, a future marketing hire, or an agency.

This is a single long document. Use the table of contents to navigate. Each section ends with a concrete checklist where useful. A consolidated benchmark table and copy/snippet appendix live at the end.

> Files in this folder:
> - `marketing-site-playbook.md` (this file) — the full playbook. See `README.md` for the folder index.
> - See the appendix sections for ready-to-paste `robots.txt`, `llms.txt`, JSON-LD schema, and copy templates.

---

## Table of Contents

**Strategy & foundation**
- [0. Product positioning, ICP & messaging](#0-product-positioning-icp--messaging)
- [1. Site architecture & the page constellation](#1-site-architecture--the-page-constellation)

**The pages**
- [2. Homepage / primary landing page](#2-homepage--primary-landing-page)
- [3. Copywriting & the messaging system](#3-copywriting--the-messaging-system)
- [4. Feature pages](#4-feature-pages)
- [5. Use-case / solution pages](#5-use-case--solution-pages)
- [6. Comparison / "vs" / alternatives pages](#6-comparison--vs--alternatives-pages)
- [7. Integration pages](#7-integration-pages)
- [8. Templates, gallery & community showcase](#8-templates-gallery--community-showcase)
- [9. Pricing page](#9-pricing-page)
- [10. The interactive demo / playground (try-it-now)](#10-the-interactive-demo--playground-try-it-now)

**Conversion**
- [11. Social proof system](#11-social-proof-system)
- [12. CTAs, forms, friction & trust signals](#12-ctas-forms-friction--trust-signals)
- [13. CRO & A/B testing process](#13-cro--ab-testing-process)

**Discovery: SEO / GEO**
- [14. Technical SEO](#14-technical-seo)
- [15. On-page & content SEO + blog](#15-on-page--content-seo--blog)
- [16. Programmatic SEO at scale](#16-programmatic-seo-at-scale)
- [17. GEO — Generative Engine Optimization (AI answer engines)](#17-geo--generative-engine-optimization-ai-answer-engines)

**Quality & operations**
- [18. Performance & Core Web Vitals (the WASM problem)](#18-performance--core-web-vitals-the-wasm-problem)
- [19. Accessibility](#19-accessibility)
- [20. Analytics, measurement & KPIs](#20-analytics-measurement--kpis)

**Adjacent pages**
- [21. Careers page](#21-careers-page)
- [22. Open-source & community pages](#22-open-source--community-pages)
- [23. Trust, security & legal pages](#23-trust-security--legal-pages)
- [24. Localization / internationalization](#24-localization--internationalization)

**Go-to-market & craft**
- [25. Launch channels & GTM sequencing](#25-launch-channels--gtm-sequencing)
- [26. Design system, visual & brand](#26-design-system-visual--brand)

**Execution**
- [27. Implementation roadmap & checklists](#27-implementation-roadmap--checklists)
- [28. Benchmark & numbers reference](#28-benchmark--numbers-reference)
- [29. Appendix: snippets & copy templates](#29-appendix-snippets--copy-templates)

---

## 0. Product positioning, ICP & messaging

Everything downstream — every headline, every page, every keyword — derives from a clear answer to *who is this for and why is it better*. Do this section first and revisit it quarterly.

### 0.1 The category decision

You are creating/occupying a category. Name it consistently everywhere (website, schema markup, G2, Crunchbase, LinkedIn, this doc). The category label is itself an SEO/GEO asset — AI answer engines and search both reward consistent entity naming.

Recommended primary category label: **"browser-based PCB design tool"** (or "online collaborative EDA"). Use it verbatim across all properties. Secondary descriptors to attach: "collaborative," "real-time," "KiCad-compatible," "no install."

The one-line positioning statement (fill in and freeze):

> **For** hardware engineers and teams **who** need to design and review PCBs together without desktop-install friction, **[Product]** is a **browser-based, collaborative EDA tool** **that** runs full KiCad in the browser and lets a team co-edit a schematic in real time. **Unlike** desktop KiCad, Altium, or proprietary web tools like Flux, **[Product]** opens your native `.kicad_*` files with zero lock-in and nothing to install.

### 0.2 Ideal customer profiles (ICPs)

Build the site to speak to these distinct buyers. Each maps to its own use-case page (§5) and gets its own social proof.

| ICP | Who | Core pain | What converts them |
|---|---|---|---|
| **Solo maker / hobbyist** | Arduino/ESP32/RPi-HAT builders, students | Desktop install friction, wants to design from any machine | Zero-install, free tier, templates, "open in browser now" |
| **Small hardware startup team** | 2–15 person teams, distributed | Emailing Gerbers/zips, painful design review, no version history | Real-time collaboration, review workflow, version history |
| **Open-source hardware project** | Community-driven, public repos | Contributors can't easily co-edit; tool licensing matters | Free for public projects, open formats, no lock-in, GitHub sync |
| **Education** | Professors, bootcamps, EE courses | Lab-machine install nightmare, students on mixed OSes | Browser-native, classroom/templates, free education tier |
| **Enterprise OEM / regulated** | Consumer electronics, IoT, aerospace-adjacent | IP security, data residency, SSO, audit | Self-host option, SOC 2, SSO/SAML, "your data is yours" |

Note: developer-/individual-facing pages favor different social proof (GitHub stars, usage counts) than team/enterprise pages (named company logos). See §11.

### 0.3 Messaging pillars

Three to five durable themes that every page reinforces. Recommended for this product:

1. **Zero install, zero lock-in.** Runs in any browser; reads/writes native KiCad files. "If we vanished tomorrow, your files open in desktop KiCad 9 unchanged."
2. **Real-time collaboration.** Multiple cursors on one board. Design review without zip files. This is the *unique* differentiator — never gate it (see §9.5, Figma lesson).
3. **Real KiCad, in the browser.** Not a lookalike — the actual KiCad engine compiled to WASM. Feature parity story, open formats, upstream contribution.
4. **Your data is yours.** Open formats, always-available export, self-host option, security posture. (Engineers have been burned by EAGLE's deprecation and Altium's subscription-only move — name this fear and answer it.)
5. **Time-to-first-board in minutes.** No download, no account wall on the demo, pre-loaded example boards.

### 0.4 Objections to preempt everywhere

Every technical buyer arrives skeptical. The site's job is to defuse these *before* the visitor articulates them (a concern named is a concern defused; a concern left unspoken causes abandonment).

| Objection | Where to answer | Answer pattern |
|---|---|---|
| "My designs aren't safe in a browser" | Hero subhead, FAQ, security page | Encrypted at rest/in transit; private by default; we never access your files; self-host available |
| "Will it have feature parity with KiCad?" | Feature page, FAQ | Be specific about what's supported *now* vs roadmap. Transparency > spin for engineers |
| "What if I'm offline / the tab crashes?" | FAQ | Autosave every keystroke; export anytime to native format |
| "Is it really free?" | Pricing, hero | Specific limits beat "free forever*". e.g. "Unlimited public projects, 3 private, full export" |
| "We already use Altium/KiCad/Eagle" | Comparison & use-case pages | Import/export compatibility; works alongside; bring your library |
| "I don't want to learn a new tool" | Use-case page, onboarding | "If you know KiCad, you know [Product]. Same shortcuts, same files, online" |
| "Startup might fold and delete my data" | Trust page, footer | Open formats + self-host + export = no existential risk |

---

## 1. Site architecture & the page constellation

A mature marketing site is **not one landing page** — it is a network of high-intent pages, each targeting a specific buyer question or search moment, internally linked so authority flows. Build the constellation, not just the homepage.

### 1.1 The map

```
yourdomain.com/                     ← Homepage (broad + navigational intent)
├── /features/                      ← Feature index
│   ├── /features/collaboration/    ← one page per major capability
│   ├── /features/schematic-capture/
│   ├── /features/pcb-layout/
│   ├── /features/drc/
│   ├── /features/gerber-export/
│   ├── /features/version-history/
│   └── /features/component-library/
├── /solutions/  (or /use-cases/)   ← persona/workflow/industry pages
│   ├── /solutions/hardware-teams/
│   ├── /solutions/open-source-hardware/
│   ├── /solutions/education/
│   ├── /solutions/design-review/
│   └── /solutions/makers/
├── /compare/                       ← comparison + alternatives (bottom-funnel)
│   ├── /compare/vs-kicad-desktop/
│   ├── /compare/vs-altium-365/
│   ├── /compare/vs-easyeda/
│   ├── /compare/vs-flux/
│   ├── /compare/altium-alternatives/
│   └── /compare/eagle-alternatives/
├── /integrations/                  ← one page per integration
│   ├── /integrations/github/
│   ├── /integrations/jlcpcb/
│   ├── /integrations/digikey/
│   └── /integrations/slack/
├── /templates/  (or /gallery/)     ← shareable designs, pSEO + activation
│   └── /templates/esp32-dev-board/
├── /pricing/
├── /blog/                          ← content marketing, topic clusters
├── /docs/                          ← documentation-as-marketing (often subdomain or subdir)
├── /changelog/                     ← trust + "active development" signal
├── /security/  /trust/             ← security posture, data ownership
├── /about/  /careers/              ← company + hiring
├── /community/                     ← Discord/forum/showcase hub
├── llms.txt  robots.txt  sitemap-index.xml
└── app.yourdomain.com  (or /app)   ← THE WASM APP — deliberately NOT indexed
```

### 1.2 The single most important architectural rule

**Hard-separate the marketing/docs site from the WASM application.**

This is not a preference — it is a technical necessity for both SEO and performance:

- The WASM app renders to a `<canvas>`; it has no semantic HTML for crawlers and will *never* meaningfully index. That's fine — you don't want it to.
- A 50+ MB WASM binary loading at startup produces multi-second LCP and INP bottlenecks. It will *never* pass Core Web Vitals. That's also fine — its users are authenticated, behind a login, so Chrome's CrUX field data (which feeds your ranking signals) never samples it.
- The marketing site must therefore be **completely free of the WASM binary**. Marketing pages should load in well under 2 seconds, contain only copy, images, and lightweight JS. **Never** preload/prefetch the WASM binary on marketing pages (not even via a service worker — it competes for the main thread and inflates INP).
- The "Open in browser / Try it now" CTA routes to `/app` (or `app.yourdomain.com`). *At that point* the user has consented to a longer load and you show a loading state.

**Domain structure:** use a **subdirectory** (`yourdomain.com/blog/`, `/docs/`) for everything you want to rank — it consolidates domain authority and ranks faster. Use a **subdomain** (`app.yourdomain.com`) only for the authenticated app you explicitly do *not* want indexed (Google treats subdomains as near-separate sites that build authority independently).

**Rendering:** build the marketing site + docs as **SSG** (Astro is ideal — ships zero JS by default, "islands" add interactivity only where needed; Next.js static export or SvelteKit also fine). Use ISR for CMS-driven pages (changelog/docs) that update occasionally. The WASM app is pure CSR behind auth.

### 1.3 Navigation

- **Header:** Product (dropdown → features), Solutions, Pricing, Docs, Blog. Right side: secondary CTA (`GitHub` or `Sign in`) + primary CTA (`Open the editor` / `Start free`).
- **Footer:** the full sitemap — every feature, solution, comparison, integration, plus Company/Careers/About, Resources/Docs/Changelog/Community, Legal/Security/Privacy/Terms. The footer is a major internal-linking and crawl-discovery surface.
- Keep one **primary** CTA dominant site-wide; secondary CTAs in lower-contrast (ghost/outline) style.

---

## 2. Homepage / primary landing page

The homepage's job: communicate the whole product in a single scroll, convert anonymous visitors, and route deep into the constellation.

### 2.1 The fold still matters

NN/g eyetracking: users spend **~57% of viewing time above the fold**, **74% within the first two screenfuls**, and the 100px just above the fold gets **102% more attention** than the 100px just below. Every critical decision — *who is this for, what does it do, what do I do next* — must be answerable from the hero alone. But users *will* scroll if the hero generates enough "information scent." A weak hero doesn't just fail to convert; it stops the rest of the page from being read.

### 2.2 Hero anatomy (six components, all above the fold @ 1280px)

1. **Eyebrow / category label** — small colored label above the H1. Names the category so the H1 can skip setup. e.g. `BROWSER-BASED · COLLABORATIVE · KICAD-NATIVE`.

2. **H1 headline** — the single most-tested element on any page. Under ~8 words / ~44 chars, outcome-focused not feature-focused. Pick a formula:

   | Formula | Example for this product |
   |---|---|
   | Capability comparison | "It's Google Docs for your PCB files" |
   | Category alternative | "A KiCad alternative that runs in your browser" |
   | Activity substitution | "Share a design, not a .zip file" |
   | Capability + quantified outcome | "Cut PCB review cycles from days to hours" |
   | Problem–solution pairing | "Real-time PCB collaboration that opens your KiCad files" |

   For this engineer audience, *alternative positioning* and *activity substitution* (targeting the current painful workflow — emailing Gerbers) generate the strongest scent.

3. **Subheadline** — never repeats the H1; expands it along one axis (audience, mechanism, or proof). ≤2 lines. e.g. *"Open any KiCad project in the browser and co-edit the schematic and board with your whole team in real time. Nothing to install."*

4. **Primary CTA (+ secondary)** — primary is the only button competing for attention. Specific copy: `Open the editor →` or `Start designing free` beats generic "Get started." Secondary in ghost style: for dev tools the best performers are `View docs`, `GitHub`, or `Watch 2-min demo`. (Generic "Learn more" underperforms.)

5. **Hero visual** — ranked by effectiveness for this product:
   1. **Live interactive embed** — an actual KiCad WASM canvas with a pre-loaded board, right in the hero. Extraordinarily high-signal for a technical audience; answers "what does this look like?" instantly. (Guard performance: lazy-init on interaction/scroll, never block LCP.)
   2. **Animated product UI** (muted autoplay loop, <2 MB) showing two cursors co-editing.
   3. **Tabbed product UI** (Schematic ↔ Board ↔ 3D view).
   4. **Static product screenshot** (WebP, <200 KB) — fastest, still effective.
   - **Never** stock photography. Show a real PCB layout canvas.

6. **Micro social proof** — directly below/adjacent to the CTA: a logo row, a star badge ("4.8/5 on G2"), a usage stat ("Used by 12,000+ engineers"), or a GitHub star count. This decision-moment reassurance drives a measured ~63% lift vs heroes without it.

### 2.3 Below-the-fold structure (recommended order)

1. Hero (above fold)
2. **Trust bar / logo wall** — immediately below hero; credibility before explanation
3. **"How it works"** — 3–5 steps, problem-oriented narrative (not a function list)
4. **Feature deep-dives** — alternating/"chess" layout or bento grid; each block is *problem-oriented* (the highest-resonance narrative type; function-lists are weakest)
5. **Social proof block** — case studies + named testimonials
6. **Differentiation/comparison strip** — "Why not just desktop KiCad / Flux / EasyEDA?" mini-table linking to full comparison pages
7. **Interactive demo / product-tour embed** — mid-page is the most common, effective position
8. **Pricing preview** — tier summary (many dev-tool homepages link out instead)
9. **FAQ accordion** — setup time, data safety, KiCad compatibility, pricing, offline
10. **Final CTA block** — full-width, contrasting (dark) background, single goal; "safety net" for visitors who scrolled without converting

### 2.4 Reading level

SaaS pages written at a **5th–7th grade reading level convert at ~12.9%** vs **~2.1%** for "professional/complex" copy — a 6× gap, and it holds for engineers. Engineers aren't decoding marketing; they're deciding whether to invest attention. Plain, direct, jargon-light wins. (Technical *depth* belongs in docs and the blog, not the homepage hero.)

---

## 3. Copywriting & the messaging system

### 3.1 Principles

- **Outcome before feature.** "Cut review cycles to hours" before "real-time multiplayer."
- **Specific beats vague.** Not "our tool is fast" but "renders a 4-layer, 200-component board in under 2 seconds in Chrome." Specificity also boosts AI citation (§17).
- **One idea per paragraph; 2–4 sentences.** Answer-first. (Also the optimal structure for AI extraction.)
- **Name the entity, kill the pronoun** in important sentences: "[Product] exports Gerbers," not "It exports them." (Helps humans skimming *and* LLM extraction.)
- **Voice:** confident, builder-to-builder, honest about limitations. Engineers reward transparency and punish hype.

### 3.2 The hero formula (extended)

`[Product] helps [specific audience] [achieve specific outcome] by [core mechanism], so they can [downstream benefit].`

> [Product] helps hardware teams ship boards faster by letting everyone co-edit the same KiCad design in the browser, so reviews happen live instead of over email.

### 3.3 Microcopy that carries disproportionate weight

| Placement | Pattern | Example |
|---|---|---|
| Below primary CTA | Risk removal | "No credit card. No install. Free for public projects." |
| Below CTA | Social momentum | "Join 12,000+ engineers" |
| Email field | Expectation setting | "Work email — we'll send a verification link" |
| Submit button | Outcome statement | "Open my first board →" |
| Post-signup | Reduce remorse | "You're in. We loaded an example board to start from." |
| Pricing button | Reinforce value | "Start free — upgrade anytime" |

### 3.4 Urgency — only the honest kind

Manufactured urgency (fake countdowns, "only 3 left") destroys trust with engineers and triggers ad-platform penalties. Legitimate mechanisms: launch/early-access waitlists, genuine price-lock before a real increase, real limited beta seats, time-stamped social momentum ("847 engineers signed up this week"), event-tied offers (Product Hunt launch). Technical urgency signals (a feature in beta, free-tier rate limits) read as more credible to developers than marketing urgency.

---

## 4. Feature pages

**Job:** rank for feature-specific intent, support detailed evaluation, serve as internal-link anchors from the homepage. One page per major capability — never cram all features onto one page.

### 4.1 Per-page structure

1. Feature name + **benefit** headline ("Review boards together, live")
2. The **pain** it solves ("Stop emailing Gerbers and merging conflicting edits by hand")
3. **How it works** — GIF/video/screenshot of the real thing
4. One or two **proof points** (a stat or a testimonial tied to *this* feature)
5. **Contextual CTA** ("Try real-time collaboration →")
6. **FAQ** (6–10 Q&As, FAQPage schema — see §17)
7. Links to related features and relevant blog posts

Framework sentence per feature: *"[Feature] solves [problem], delivering [benefit] without [constraint]."*

### 4.2 The feature set to give pages

`/features/collaboration/` (the flagship — multiple cursors, presence, live review), `/schematic-capture/`, `/pcb-layout/`, `/drc/` (design rules check), `/gerber-export/`, `/3d-viewer/`, `/version-history/`, `/component-library/`, `/kicad-import-export/`, `/bom/`. Each is both a conversion surface and an SEO target for its long-tail keyword.

---

## 5. Use-case / solution pages

**Job:** speak directly to one role/workflow/industry so the buyer doesn't have to translate. Make the product feel purpose-built.

Benchmark: Miro's per-use-case pages (mind map, wireframing, etc.) — one such page ranks for **4,000+ keywords** and ~130K monthly visits. The model works.

### 5.1 Structure

1. Lead with the **specific problem** *before* the product ("Your team spends 3 days per revision on Gerber email chains")
2. How the product solves it *for this segment*
3. One **targeted** case study/testimonial from that exact segment
4. Segment-specific feature emphasis
5. **Contextual CTA** ("Start a free design review")

### 5.2 The pages to build (mirror the ICPs from §0.2)

`/solutions/hardware-teams/`, `/solutions/open-source-hardware/`, `/solutions/education/`, `/solutions/design-review/`, `/solutions/makers/`, `/solutions/enterprise/`. Cut by persona, workflow, industry, and company size.

---

## 6. Comparison / "vs" / alternatives pages

**The highest-ROI bottom-funnel pages.** Comparison pages convert at **~7.5%+** — roughly **15× a standard blog post** — because they meet buyers at the decision moment. And as of late 2025, **~51% of B2B software buyers start research in an AI chatbot**, where G2/Capterra/comparison content is the #1 confidence signal — so these pages do double duty (direct conversion + AI citation).

### 6.1 Per-page structure (`/compare/[product]-vs-[competitor]/`)

1. **H1 starting with your brand:** "[Product] vs Altium 365: Which Should You Choose?"
2. Brief, **honest framing** — acknowledge you're the vendor; address bias upfront
3. **Verdict summary table** (3–5 key differentiators, ✓/✗)
4. **Full feature comparison table** (collapsible; only *differentiating* features)
5. 3–5 qualitative sections (browser-native vs install, real-time collab, open formats, price, support)
6. **"When to choose [competitor]"** — not weakness; it qualifies prospects and builds trust
7. **Switcher testimonials** (customers who came from that competitor)
8. **FAQ** (pricing, migration, data portability)
9. High-contrast CTA

URL: `/compare/product-vs-competitor/`. Build both `vs-X` pages and multi-competitor **`X-alternatives`** hub pages.

### 6.2 The comparison pages to build

Driven by real demand in this category:
- **`/compare/vs-kicad-desktop/`** — "same files, same shortcuts, now collaborative + no install"
- **`/compare/altium-alternatives/`** — Altium ended perpetual licenses (July 2024 → ~$355/mo subscription), creating real switching demand
- **`/compare/eagle-alternatives/`** — EAGLE absorbed into Autodesk Fusion; free-tier refugees searching
- **`/compare/vs-easyeda/`** — EasyEDA (JLCPCB-owned) dominates hobbyist/fab-integrated; differentiate on KiCad compatibility & no fab lock-in
- **`/compare/vs-flux/`** — Flux is the closest browser-native competitor; differentiate hard on **native KiCad file compatibility** (Flux uses a proprietary format you can't open in desktop KiCad), open-source roots, and self-host

Be intellectually honest in every one — acknowledge what desktop KiCad and Altium do better. Engineers detect and punish spin; honesty is what makes these pages trusted *and* AI-citable.

---

## 7. Integration pages

**Job:** capture "[Product] + [other tool]" long-tail search from buyers deep in evaluation; demonstrate ecosystem fit; reduce switching risk.

One page per meaningful integration: **GitHub/Git** (version control sync), **JLCPCB / PCBWay** (fab handoff), **DigiKey / Mouser** (component sourcing/BOM), **Slack** (notifications), **Jira/Confluence**. Structure: benefit of the integration + brief setup steps + CTA. Best practice: create pages for *planned* integrations too, to capture demand before competitors. Add `HowTo` schema to the setup steps.

---

## 8. Templates, gallery & community showcase

**Job:** PLG activation + long-tail SEO + social proof — simultaneously.

A public, browsable gallery of shareable PCB designs (Arduino shields, ESP32 boards, motor controllers, common form factors, reference designs) does three things at once:
- **SEO:** ranks for "[component] PCB design template / reference design"
- **Activation:** a visitor opens a template and *immediately* experiences core value (no blank canvas — the canonical PLG anti-pattern)
- **Social proof:** shows what real designs look like in the tool

Benchmarks: Figma Community, Notion Template Gallery, Webflow Showcase, and in-category EasyEDA/Tinkercad galleries.

Per template: own URL, title, thumbnail, description, single CTA `Open in [Product] →`, and **downloadable as native `.kicad_*` files** (a trust signal: no lock-in). Community-submitted templates create compounding content and viral loops. Conversion path: template page → instant browser preview → sign up to save/edit. This is also a natural **programmatic SEO** surface (§16) if you have a real dataset of designs.

---

## 9. Pricing page

### 9.1 Tier architecture

- **Three tiers** is the workhorse: ~**1.4× the conversion** of two-tier; **four+ tiers carry a ~31% penalty** (choice overload). ~41% of startups use exactly three.
- **Descriptive names** ("Maker / Team / Enterprise") beat generic "Basic/Pro/Enterprise" — they signal *who each tier is for*.
- **Value-metric gating** (seats/collaborators, projects, private vs public, history depth) beats feature gating for a collaboration tool — it aligns cost with usage and supports expansion revenue. Natural metrics here: concurrent collaborators per design, number of private projects, revision-history depth, SSO/org features.

### 9.2 Psychology

- **Anchoring:** the highest tier sets the reference point. Consider presenting tiers high→low so the big number is seen first. Always include a non-priced **Enterprise/Custom** column even if all sales happen elsewhere — it anchors everything else cheaper. Enterprise CTA = `Talk to us` / `Get a quote` routing to a calendar, not the signup flow.
- **Charm pricing** (prices ending in 9) → ~24% average lift across studies.
- **"Most popular" badge** on the target tier → 25–40% selection lift — but only if *truthfully* supported by data.
- **Decoy effect:** a deliberately dominated tier can push selection toward the target tier.

### 9.3 Annual/monthly toggle — highest-ROI element on the page

- Annual customers churn at **5–10%/yr** vs **30–50%** for monthly. **Default to annual.**
- Optimal discount band: **15–20%** (deep enough to compel, not so deep it devalues).
- **Loss framing beats gain framing ~2:1:** "Save $240/year" > "Get 2 months free" (same math).

### 9.4 Trust signals on the pricing page

Place beside the CTA: "Cancel anytime" (**+23%** trial-start), money-back guarantee (**+16%**), combined **+34%**. Address the four universal objections inline: setup cost ("Free to start"), commitment ("No annual contract required"), hidden fees ("No per-seat surprises"), security ("SOC 2 Type II"). Add a logo bar for borrowed credibility.

### 9.5 The open-source / free-tier rule (critical for this product)

The free tier is the **primary acquisition channel**, not a courtesy. And the **Figma lesson is mandatory:** Figma initially gated *collaboration* (2-collaborator cap) and found it prevented users from experiencing the core value; they reversed to unlimited collaborators on limited files. **Never gate the feature that proves your differentiation** — for you that is real-time multiplayer co-editing.

Free-tier guidance:
- **Lead with what it enables, not what it lacks:** "Design PCBs free, forever. No account needed to start."
- **Be specific about limits** — vague limits ("limited features") create more anxiety than concrete ones ("unlimited public projects, 3 private, full export, up to 3 live collaborators").
- **Never lock exports** (Gerber, BOM, native KiCad) behind paid — that's a trust-destroyer in this audience.
- **Show the upgrade path inside the free experience** — hitting a limit should feel like graduation, not a wall.

Suggested shape: **Free** (unlimited personal + public projects, full KiCad feature set, real-time collab up to 2–3 collaborators, all exports). **Team** (unlimited collaborators, version history, private projects, org management). **Enterprise** (SSO/SAML, self-host, audit logs, support SLA, custom).

---

## 10. The interactive demo / playground (try-it-now)

For a developer tool, a public, **no-signup**, immediately interactive sandbox is the single highest-converting funnel entry point. (Replit runs code with no account; one API-security startup *halved* CAC with a live sandbox as its main funnel.)

For this product specifically:
- Ship a public demo URL with a **pre-loaded example board** (e.g. ESP32 dev board). Let visitors zoom, run DRC, edit a trace, export — **without an account**. This interaction is your most powerful marketing asset and a "show don't tell" proof no copy can match.
- **The 10-minute rule:** users who reach a meaningful first action within ~10 minutes convert **3–4×** more. **68%** of dev-tool abandonment is "too much setup time" (only 12% cite pricing). Land users *in a working board*, not a blank canvas. Skip mandatory email verification on trial start; use progressive profiling.
- Interactive demos/tours lift qualified leads **20–25%**.
- **Performance caveat:** the demo embeds the WASM app, so it lives at `/app`-class infrastructure or a clearly separated, lazy-loaded route — never inline on the marketing homepage's critical path (§1.2, §18).

---

## 11. Social proof system

### 11.1 Impact by type

| Type | Lift | Notes |
|---|---|---|
| Video testimonials | +80–86% vs text | Highest-impact format |
| Real-time activity notifications | +98% | Use sparingly; can feel manipulative |
| Hero logo bar (above fold) | +63% | Decision-moment |
| Review-platform badges (G2/Capterra) | ~37% | Third-party > self-reported |
| Any customer testimonials | +34% | 92% of buyers read them |
| One extra review star | +5–9% sales | — |

### 11.2 Developer-tool nuance

- **Individual-/maker-facing pages:** GitHub stars, download/usage counts, "used by engineers at 400+ companies," awards — these outperform corporate logo walls.
- **Team/enterprise pages:** named company logos dominate. "Including engineers at [recognizable hardware companies]" beats a nameless "450+ companies."
- **Mixed:** combine — a logo wall for credibility + a usage stat ("2M designs created", "14k GitHub stars") for authenticity.
- **Curate, don't auto-pull.** Hand-styled quotes (even styled to look like tweets/GitHub comments) beat noisy live social feeds. Keep relevance and message quality under control.
- **Accumulate G2/Capterra/TrustRadius reviews actively** — they convert skeptics *and* now feed what AI chatbots surface in research queries.

### 11.3 Placement blueprint

| Position | Type |
|---|---|
| Hero (below CTA) | Logo strip or star rating |
| Trust bar | 6–8 grayscale logos |
| Inside each feature section | One-sentence quote *about that feature* (contextual > a generic "wall of testimonials") |
| Near mid-page CTA | Short testimonial + avatar |
| Pricing (beside tiers) | G2 badge + one quote per tier's persona |
| Comparison pages | Switcher testimonials |
| Final CTA block | Usage number ("Join 12,000 engineers") |

---

## 12. CTAs, forms, friction & trust signals

### 12.1 CTA copy

- **First-person** beats second-person: "Start **My** Free Trial" > "Start Your…" (ownership effect).
- **Specific** beats generic: "Open my first board" / "Start building" > "Get started."
- **Value in the button:** "Start Free — No Credit Card Required" as one label.
- **State the time commitment** where relevant: "Start your free 14-day trial."
- **Personalized CTAs convert ~202% better** — serve copy by traffic source/segment where feasible.
- Dev-tool **secondary** CTAs that perform: `View docs`, `GitHub`, `Join waitlist`.

### 12.2 Forms — ruthless minimalism

- **81%** who start a form don't finish; **67%** never return. Top causes: security concerns (29%), excessive length (27%).
- **11→4 fields = +160% completions.** **≤5 fields = +120%** vs longer.
- For PLG signup: **email only** (or email+password). Everything else via **progressive profiling** *after* the user hits value.
- **Never ask for a credit card at free-trial signup** unless deliberately running the opt-out (CC-required) model.
- A **GitHub URL field** is more informative than a cover-letter-style ask for this audience.
- **"No credit card required"** microcopy under the button is the highest-leverage friction reducer in SaaS.

### 12.3 Trust signals by page stage

- **Hero:** SOC 2 / ISO 27001 badge, "GDPR compliant," and the IP statement that matters here: *"Your designs are private by default. We never access your files."*
- **Pricing:** "No long-term contract," "Cancel anytime," guarantee.
- **Form/signup:** "We won't spam you," privacy link, security badges (17% of abandonment is trust/security).
- **Product-specific objections to answer in copy:** "What happens to my design data?" (hero/FAQ) and "Does it work offline / what if the browser crashes?" (FAQ/data-safety page).

---

## 13. CRO & A/B testing process

### 13.1 Process: Discover → Hypothesize → Test → Learn

The common failure is testing without a documented hypothesis and a single success metric. Before testing, gather: quantitative (GA4/heatmaps/scroll depth/drop-off), qualitative (session recordings, interviews, exit surveys), technical (Core Web Vitals, mobile audit).

**Prioritize with ICE or PIE** (Impact × Confidence × Ease). Only ~17% of SaaS companies test actively; teams running 2–3 tests/month compound improvements while "wait for the big test" teams stagnate. Testing 10+ sequential variations yields ~86% better results than a single test; ~5%/test monthly compounds to ~80%/yr.

### 13.2 Test in this order (largest variance first)

1. H1 headline → 2. primary CTA wording → 3. CTA color/placement → 4. hero visual (screenshot vs video vs interactive) → 5. social proof type/placement → 6. form length → 7. pricing highlight/default toggle → 8. page length.

One variable per test. Target **95% confidence**, **100–200 *conversions* per variant** (not sessions). Don't "peek" before significance — the #1 false-positive cause.

### 13.3 Tools & guardrails

VWO (marketing-owned), Optimizely (eng-owned, feature flags), Convert (privacy-focused/GDPR), Hotjar/FullStory (qualitative discovery), PostHog (OSS, PLG-native, flags + product analytics). 

Don't: test price against existing customers (test *presentation* with new cohorts only); run overlapping tests on one page without MVT design; optimize conversion in isolation — optimize **revenue per visitor** (a signup lift that attracts non-activating users is not a win).

---

## 14. Technical SEO

### 14.1 Crawlability ≠ indexability

Crawlable = Googlebot can fetch it; indexable = Google chooses to keep it. Common crawl failures: `Disallow: /`, blocking JS/CSS, 4xx/5xx (as of Google's Dec 2025 docs, pages returning 4xx/5xx are excluded from JS rendering entirely), `noindex` left from staging, redirect chains >3–4 hops. Common index failures: duplicate content without canonical, thin content, wrong canonical.

### 14.2 robots.txt

Controls **crawl**, not indexing (a blocked page can still appear, snippet-less, if linked). Use `noindex` meta (not robots) to keep pages out of the index. **Never block JS/CSS** from Googlebot. Place at root; declare your sitemap. (Full AI-crawler config in §17.3 and the appendix.)

```
User-agent: *
Disallow: /app/
Disallow: /api/
Allow: /

Sitemap: https://yourdomain.com/sitemap-index.xml
```

### 14.3 XML sitemaps

Limits: **50 MB / 50,000 URLs** per file; use a sitemap index for more. Include **only canonical, indexable** URLs (no `noindex`, no facets/params). Use accurate `<lastmod>` (Google ignores it if unreliable; ignores `<priority>`/`<changefreq>` entirely). Submit via Search Console. A sitemap is a *hint*, not a command.

### 14.4 Canonicals

Self-referencing canonical on every page (protects against param/CDN duplication). Absolute HTTPS URLs. Canonical and hreflang must agree (the canonical of a localized page must be in the same hreflang cluster).

### 14.5 Structured data (schema.org, JSON-LD)

Implement as **JSON-LD** (Google's preferred). For this product: `SoftwareApplication` (primary — enables rating/price in SERP; correctly-implemented pages see notably higher CTR), `Organization` (homepage, establishes the Knowledge Graph entity), `FAQPage` (every page with FAQs), `HowTo` (tutorials/integration setup), `Article`/`BlogPosting` (all editorial), `BreadcrumbList`, `Person` (author bios), `WebSite` (sitelinks search box). Validate with the [Rich Results Test](https://search.google.com/test/rich-results). (Full snippets in the appendix; AI-citation value in §17.)

### 14.6 hreflang / i18n

ISO 639-1 language + ISO 3166-1 region codes. Every localized page references **all** alternates **and itself**; missing return-links void the whole cluster. `x-default` fallback. Absolute URLs only. Manage via sitemap for large sites. (>65% of international sites have hreflang errors — audit quarterly.)

### 14.7 JS rendering

**Progressive enhancement:** core content, metadata, and links must exist in server-rendered HTML. Marketing + blog + docs → **SSG**; dynamic-but-indexable → SSR/ISR; the WASM app → CSR behind `/app`, deliberately unindexed.

### 14.8 Mobile-first indexing

Google ranks on the mobile version. **Content parity** (same text, links, headings, structured data, alt text on mobile and desktop). Responsive design. Don't lazy-load *primary* content.

### 14.9 URL structure & internal linking

Lowercase, hyphenated, hierarchy-reflecting slugs (`/features/real-time-collaboration/`), ≤~75 chars, ≤3–4 levels. Every blog post links to ≥3 relevant feature pages + related posts with descriptive anchors. No orphan pages. Use the topic-cluster model (§15.3). Add 5–10 internal links on publish.

### 14.10 HTTPS, crawl budget, Search Console

All HTTPS (301 not 302; HSTS; no mixed content). Crawl budget matters once you have thousands of pSEO pages (§16) — block worthless URLs, keep the sitemap clean, fix 4xx/5xx, improve TTFB; log-file analysis (Screaming Frog/Semrush/Botify) shows what Googlebot *actually* crawls vs what Search Console reports. Set up GSC for both `yourdomain.com` and `app.yourdomain.com` (segment app vs marketing). Monitor weekly: Coverage ("crawled-not-indexed" is a quality signal), Core Web Vitals, Search Performance, Sitemaps.

---

## 15. On-page & content SEO + blog

### 15.1 Keyword research & intent

Match every page to a documented query *and* an intent type:

| Intent | Signals | Format | Examples for this product |
|---|---|---|---|
| Informational | how/what/why/guide | Blog, docs | "how to design a PCB", "what is a gerber file" |
| Commercial | best/top/vs/alternative | Comparison, listicle | "best PCB design software", "KiCad vs Altium" |
| Transactional | free/pricing/sign up | Landing, pricing | "browser PCB editor", "collaborative PCB design pricing" |
| Navigational | brand + feature | Product page | "[Product] gerber export" |

Workflow: Ahrefs/Semrush (both label intent) → seed terms ("PCB design software", "KiCad online", "collaborative EDA") → filter **KD <30** for early winnable targets → check the live SERP format and match it.

### 15.2 The keyword map for this category

**High-intent / competitive:** "Altium alternative", "Eagle alternative", "KiCad online", "KiCad cloud", "browser PCB design", "online PCB editor", "collaborative PCB design", "web-based EDA", "PCB design no install".
**Medium-intent / problem-first (your sweet spot):** "how to share KiCad project with team", "KiCad version control collaboration", "PCB design review online", "view KiCad file in browser", "open KiCad without installing", "PCB design student free".
**Comparison/decision:** "KiCad vs EasyEDA vs Flux", "KiCad vs Altium 2026", "best free PCB design software", "Altium 365 alternative".
**Technical long-tail (near-zero competition, high trust):** "KiCad WebAssembly", "run KiCad in browser", "KiCad WASM", "KiCad collaborative editing" — discovery terms engineers will *share* if the post is authoritative.

### 15.3 Topic clusters & pillar pages

Clustered content drives ~30% more organic traffic and holds rankings ~2.5× longer than standalone posts. One **pillar** (2,000–5,000 words, broad head term) + multiple **cluster posts** (800–2,000 words, long-tail), **bidirectionally linked**. Reflect it in URLs:

```
/pcb-design/                      ← pillar: "The Complete Guide to Browser-Based PCB Design"
/pcb-design/import-kicad/         ← cluster
/pcb-design/gerber-export/        ← cluster
/pcb-design/team-collaboration/   ← cluster
```

Cluster ideas: PCB Design Fundamentals (authority), KiCad Tutorials (captures existing KiCad users), EDA Software Comparisons (commercial intent), PCB Manufacturing/Fab (adjacent authority), Electronic Design Collaboration (your differentiator).

### 15.4 Title tags & meta descriptions

Title ≤**60 chars**, primary keyword near the front, brand at the end ("How to Design a PCB in the Browser | [Product]"). Meta description **150–160 chars**, unique per page, with the keyword (Google bolds matches) and a real value prop. No ranking weight but drives CTR (which influences rankings).

### 15.5 Headings, depth, freshness

One `<h1>` per page; don't skip levels; headings must match content. Cover the topic more completely than the current top-3; add original data/screenshots. Audit/update core posts every **3–6 months**; update `dateModified` and sitemap `<lastmod>` only on substantive change (faking dates is detectable).

### 15.6 E-E-A-T for a technical tool

- **Experience:** real screenshots of designs made in the tool, real user case studies, posts by engineers who *use* it.
- **Expertise:** content written/reviewed by actual EEs/PCB designers; author bylines with credentials.
- **Authoritativeness:** backlinks from electronics blogs, maker communities, fab houses, engineering pubs; presence in "best of" lists.
- **Trust:** clear privacy/terms/pricing/about with real team; security docs for a tool handling proprietary designs.
- Google's "Who / How / Why": named authors, transparent process (disclose AI assistance), content for users not rankings.

### 15.7 Blog best practices

- **Cadence:** consistency > volume. **2–4 quality posts/month** beats daily thin posts. One great guide earns more than a dozen shallow ones.
- **Formats that work for engineers:** technical deep-dives (the WASM port story, CRDT/OT collaboration internals, the wxWidgets-in-browser story), tutorials (beginner→expert), comparison/"best X" listicles, build logs & teardowns (take a real product, rebuild its PCB in the tool, document warts and all), case studies, changelog/release notes.
- **Distribution beyond publish:** electronics newsletters (Hackster, The Amp Hour), engineering communities (r/PrintedCircuitBoard, r/KiCad, EEVblog, KiCad forum), cross-post to LinkedIn + dev.to/Hashnode with canonical back to the original, repurpose top posts into YouTube/threads/talks.

---

## 16. Programmatic SEO at scale

pSEO generates many pages from structured data + templates. Viable angles here: `/compare/[a]-vs-[b]/`, `/library/[component]/`, `/templates/[board-type]/`, `/integrations/[manufacturer]/`.

**When it works:** you have a *genuine unique dataset* (component specs, real comparison data, real integration details) so pages differ meaningfully; each answers a specific intent not already served; you already have ~20–30 manual indexed pages + some authority; you launch in **staged batches** (20–30, verify indexing in ~2 weeks, then expand).

**When Google penalizes it (and it does — see the May 2026 core update targeting exactly this):** near-identical pages with only a modifier swapped; <300 words of unique content (aim **500+** with 30–40% differentiation between pages); AI-spun rewrites of templated content; launching on a brand-new domain with no authority.

**Quality thresholds:** 80%+ indexed within 4 weeks (below that → quality problem), 8+ unique data points per page, 3+ internal links per page, engagement within 30% of hand-crafted pages. **Log what you cap** — if you truncate to top-N, say so.

---

## 17. GEO — Generative Engine Optimization (AI answer engines)

Getting cited by ChatGPT, Google AI Overviews/AI Mode, Perplexity, Claude, Gemini, and Copilot. **SEO gets you ranked; GEO gets you quoted.** This matters now: AI Overviews appear on ~48% of queries; ~69% of searches are zero-click; AI-search visitors convert at multiples of standard organic. Being cited builds brand recall even with no click.

### 17.1 The strategic reframe

- **Brand search volume is the strongest predictor of LLM citation** (correlation ~0.334) — stronger than backlinks (weak/neutral). Everything that builds brand awareness (community, conferences, open-source contributions, earned media) compounds into AI visibility. This is your north star.
- **The Princeton GEO asymmetry is your advantage:** adding source citations gave *lower-ranked* sites a **+115%** visibility gain (vs little change for incumbents). You can out-cite established competitors before you have their backlinks.
- **Own the category definition.** You can own "browser-based PCB design" and "KiCad in the browser" as AI-citation categories if you publish the authoritative defining content first. Highest-ROI GEO move for your stage.

### 17.2 Tactics that increase citation probability

From the Princeton GEO paper (KDD 2024) and 2025–26 citation studies:

| Tactic | Effect |
|---|---|
| Cite authoritative sources per claim | +30–40% (up to +115% for lower-ranked sites) |
| Add statistics / numeric data | +41% (most consistent) |
| Include expert quotations | +30–40% |
| Fluent, well-edited prose | +15–30% |
| Confident, declarative voice (less hedging) | +10–20% |
| Keyword stuffing / padding / over-simplification | zero or negative |

**Structure for extraction** (AI cites individual passages, not pages):
- H2/H3 as **questions users actually ask**, <10 words.
- Each section opens with a **40–75 word answer-first paragraph** that stands alone (the "citation block"). Passages of 40–75 words are cited ~3× more than longer ones.
- One idea per paragraph; split any paragraph with "but/however/meanwhile."
- **Tables** are cited ~4.2× more than equivalent prose; numbered lists +2.7×; bullets +1.8×. Use semantic `<table>`/`<ol>` (verify it reads with CSS off).
- **Comparative listicles** ("Best browser-based PCB tools") earn ~32.5% of all AI citations — publish them aggressively.
- **FAQ sections** (6–10 Q&As, 40–60-word answers) marked up with FAQPage schema, at every funnel stage.
- **Name entities, kill pronouns.** Cover the topic cluster's entities (ECAD, EDA, schematic, netlist, Gerber, DRC, KiCad, Altium, WebAssembly, multiplayer). Use the *same* category label across site + schema + G2 + LinkedIn + Crunchbase.
- **Fact density + freshness:** specific numbers/dates/sources; visible "Last updated"; `dateModified` in JSON-LD (updating it triggers re-crawl in ~48–72h; 65% of AI-bot hits target content <1yr old).

**E-E-A-T as a hard filter:** named authors with full bios + `Person` schema (`sameAs` → LinkedIn/GitHub/ORCID), consistent `Organization` entity across the web, third-party validation (Hackaday, IEEE Spectrum, EEWeb, Tom's Hardware), and original data you publish.

### 17.3 Technical GEO

**Allow AI crawlers** (blocking = no citations). Both *retrieval/citation* crawlers (power live answers) and *training* crawlers (build brand familiarity in weights) — allow both for a B2B tool:

```
User-agent: OAI-SearchBot   # ChatGPT search/citation
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Google-Extended # controls AI Overviews + Gemini
Allow: /
User-agent: GPTBot          # OpenAI training
Allow: /
# ...block only /app/, /api/, /account/
```

Notes: `GPTBot` (training) ≠ `OAI-SearchBot`/`ChatGPT-User` (citation) — allow all three for full ChatGPT visibility. **Cloudflare's "Block AI Bots" toggle overrides robots.txt** — verify it's off for marketing pages. (Full file in the appendix.)

**Schema** (§14.5) does double duty: pages with `Article + ItemList + FAQPage` get ~1.8× the citations of `Article` alone; structured-data pages appear 20–30% more in AI summaries.

**`llms.txt`** (a markdown index at `/llms.txt` pointing AI to key docs): implement it — 30 minutes, future-proofs you — **but don't prioritize it**; no major provider has confirmed they parse it yet, and audits show ~zero current crawler hits. Symbolic infrastructure for now. (Template in the appendix.)

### 17.4 Platform-specific & off-site

- **ChatGPT** leans on Wikipedia (~48% of its citations) and Bing's index (87% overlap with Bing top-10) → maintain Bing health + pursue a Wikipedia category/entity presence.
- **Perplexity** leans heavily on **Reddit** (~half its citations) and fresh content → genuine activity in r/PrintedCircuitBoard, r/KiCad, r/electronics (answer where relevant, never spam) feeds both Perplexity *and* the brand-mention signal.
- **Google AI Overviews:** 52% of citations from top-10 organic → top-10 ranking + FAQ/HowTo schema + E-E-A-T still matter.
- **Reference layer:** create/claim Crunchbase, Product Hunt, G2/Capterra (same category label), and a **Wikidata** entry (LLMs treat it as axiomatic). GitHub org stars/contributors are entity signals for a dev tool.
- **Measure:** add an "AI Search" channel in GA4 (regex on `chatgpt|perplexity|claude|gemini|copilot|...` + `medium=ai-assistant`); run 20–30 manual citation-check queries/month across ChatGPT/Perplexity/Gemini; track brand-search volume in GSC as the LLM-familiarity proxy.

---

## 18. Performance & Core Web Vitals (the WASM problem)

### 18.1 Thresholds (75th percentile of real users)

| Metric | Good | Poor |
|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤2.5 s | >4.0 s |
| **INP** (Interaction to Next Paint) | ≤200 ms | >500 ms |
| **CLS** (Cumulative Layout Shift) | ≤0.10 | >0.25 |

INP replaced FID in March 2024 — it observes **all** interactions and reports the worst. 75% of visits must be "good" to pass.

### 18.2 Why CWV matters (business case)

Tiebreaker for ranking (not a relevance replacement), but the conversion math is decisive: a **0.1 s** speed improvement lifts conversions **+8.4%** (retail). Pages loading in 1 s convert **2.5–3×** better than 5 s. 53% of mobile visitors abandon >3 s loads.

### 18.3 The WASM separation (restating §1.2 because it's the whole game)

**The app will never pass CWV — and that's fine, because it's behind auth and CrUX never samples it.** Your Search Console CWV reflects *only* marketing URLs. Therefore: keep the WASM binary entirely off marketing pages; never inline/preload/prefetch it there (not even via service worker); route "Try it" to `/app` with a loading state.

### 18.4 Optimizing the marketing site (which CrUX *does* sample)

**LCP** — preload the hero image (`<link rel="preload" as="image">`), add `fetchpriority="high"` to it (Google Flights saw 700 ms gain from this alone), **never** `loading="lazy"` the LCP image, serve WebP/AVIF + `srcset`, self-host critical fonts, CDN everything, TTFB <600 ms.
**INP** — keep marketing JS tiny; break up any >50 ms task (`scheduler.yield()`); avoid layout thrashing; `content-visibility:auto` for offscreen; any WASM/heavy work in a Web Worker (and not on marketing pages at all).
**CLS** — explicit `width`/`height` or `aspect-ratio` on every image; preload fonts + `font-display:swap` + `@font-face` metric overrides (`size-adjust`, `ascent-override` — can cut font CLS ~70%); reserve space for any injected banners/cookie bars.

### 18.5 Stack & measurement

SSG marketing site (Astro/Next static/SvelteKit) on a CDN; no WASM `<script>`; defer/async all third-party scripts. Measure with **field data** (Search Console CWV report, CrUX, PageSpeed Insights, web-vitals RUM library) over lab data — Google ranks on field data.

---

## 19. Accessibility

Target **WCAG 2.1 Level AA** across the marketing site, careers page, and forms (the court-applied benchmark for private employers under ADA Title III; a hard requirement on careers/application flows — §21). Essentials: alt text on all images, keyboard navigability, screen-reader-compatible forms, captioned videos, AA color contrast, accessible PDFs (or HTML equivalents). Accessibility also overlaps with SEO (alt text, semantic HTML, headings) and with GEO (semantic structure aids extraction). The WASM canvas app has its own (harder) a11y story — out of scope here, but don't let the marketing site inherit canvas-app excuses.

---

## 20. Analytics, measurement & KPIs

### 20.1 Stack

GA4 (or a privacy-first alternative like Plausible/PostHog for EU posture) + Google Search Console + Bing Webmaster Tools + a heatmap/session tool (Hotjar/PostHog) + the AI-citation monitors from §17.4. Tag the funnel: visit → demo-opened → signup → activation (first board/export = your PQL) → paid.

### 20.2 Funnel KPIs & benchmarks

| Stage | Benchmark |
|---|---|
| Landing page CVR (SaaS median) | 3.8% (good self-serve target 4–10%) |
| Visitor → free trial (opt-in, organic) | ~8.5% |
| Trial → paid (opt-in, no CC) | ~18% |
| Trial → paid (opt-out, CC required) | ~49% |
| Visitor → freemium | ~13% |
| Freemium → paid | ~2.6% |
| **PQL → paid** | **15–30%** (vs MQL 2–5%) |
| Comparison-page CVR | ~7.5% (~15× a blog post) |

Optimize **revenue per visitor**, not raw CVR. Track **brand-search volume** (LLM-familiarity proxy) and **AI-referral share** as first-class metrics now, not later.

---

## 21. Careers page

For a KiCad-based, open-source-adjacent startup, the careers page and your open-source program are your **most effective recruiting tools** — they let candidates see real engineering before they apply.

### 21.1 EVP & anatomy

Write a concrete **Employee Value Proposition** for engineers in the open-hardware/EDA ecosystem — not generic startup boilerplate. Five pillars: comp & benefits (incl. equity, hardware budget, conference travel), career development, work-life balance (83% cite this), culture & values, **purpose/mission** (democratizing hardware design; contributing to open hardware). If you can't pay top-of-market cash, say so and compensate with equity, autonomy, mission, and open-source prominence.

Page sections: mission hero (one sentence an engineer cares about + one real visual + "See open roles"), mission & values *shown concretely* ("each engineer owns their roadmap items design→merge"), life-at-company (authentic photos, 60–90 s video), benefits **with numbers/ranges**, a genuine **DEI statement** (metrics + initiatives, honest if early-stage), employee testimonials/team page (deep stories + GitHub links with consent), **recruitment-process transparency** (stages + timeline), filterable job listings (each linking to its own indexable URL), job-alert email signup.

### 21.2 Job descriptions

Structure: title (50–60 chars, market-standard, seniority explicit) → hook → about (3–5 sentences) → **What you'll do** (deliverable-oriented) → **Required** (5–7 items) vs **Preferred/bonus** (explicitly labeled) → **compensation** (range + equity + benefits) → location/remote → process → EEO statement. Candidates spend ~50–77 seconds before deciding — front-load.

**Inclusive language** has huge ROI: removing gender-coded words ("ninja", "rockstar", "dominant", "competitive") lifts applications **+29%** and cuts cost-per-app **41%**; gender-neutral JDs fill ~2 weeks faster. Replace "native English speaker" → "fluent in written/spoken English"; "Bachelor's required" → "or equivalent practical experience" (IBM dropping degree reqs → +63% diverse applicants). Make **must-have vs nice-to-have** explicit — long undifferentiated lists make qualified (esp. underrepresented/neurodiverse) candidates self-select out. For engineers: "strong C++" (required) vs "experience with KiCad" (bonus).

**Salary transparency:** include a range in **every** posting. Salary is the most important element for 61% of applicants; 50% abandon when it's missing. It's legally required for remote-US roles in a growing list of states (CA 15+, CO 1+, NY 4+, IL, WA, MD, MA, MN, NJ, VT, etc. — and remote roles that *can be performed* in those states are covered even if you're HQ'd elsewhere) and across the EU under the **Pay Transparency Directive** (transposed by 7 June 2026: salary range in postings or before first interview, gender-neutral titles, no salary-history questions, all employers regardless of size).

### 21.3 JobPosting structured data (Google for Jobs)

70% of job searches start on Google; Google for Jobs is a free, high-reach channel. On **each individual job page** (never list pages), add `JobPosting` JSON-LD. Required: `title` (no salary/codes/location in this field), `description` (full HTML), `datePosted`, `hiringOrganization`, and `jobLocation` *or* `applicantLocationRequirements`. Strongly recommended: `validThrough`, `baseSalary` (min/max/currency/unitText — including it lifts apply rates 15–25%), `employmentType`, `jobLocationType: TELECOMMUTE` for remote. Validate with the Rich Results Test. **Remove filled jobs** via past `validThrough`, 404/410, or deleting the markup — stale listings risk manual demotions. (Full snippet in appendix.)

### 21.4 Application UX & ATS

Drop-off is brutal: 60% quit mid-application; 73% abandon if >15 min; <5-min apps complete at 12.5% vs 3.6% for >15-min — a **3.45×** difference; the average app is **51 clicks**. So: ask only name, email, resume/LinkedIn/**GitHub URL**, and 2 targeted questions; use resume parsing + LinkedIn/GitHub auth to pre-fill; no account-creation wall before applying; multi-step + progress bar + save-and-resume if longer. **Mobile**: 69% of Gen Z apply on phones — test the whole funnel on a real phone. Send instant confirmation + set expectations + don't ghost (69% won't accept an offer after a slow response). ATS for startups: **Ashby** or **Lever** for <50 people, Greenhouse for enterprise scale. **EEO/self-ID** (US): voluntary, stored separately from the application, invisible to hiring managers; federal contractors have specific OFCCP/Section 503/VEVRAA obligations.

### 21.5 Sourcing engineers + compliance

Channels: Google for Jobs (schema), LinkedIn, **HackerNews "Who is Hiring"** (monthly, free, high-signal — mention KiCad/EDA/browser/WASM explicitly), Wellfound, niche EDA/embedded boards, KiCad forum/Discord/mailing list, and **GitHub contributor search** on KiCad/wxWidgets/adjacent repos (the best-qualified, most-motivated population). Careers SEO: keyword-rich job URLs on *your* domain (not iframe'd ATS, which isn't indexed), ~500 unique words/posting. **Compliance:** EEO statement on every posting; **WCAG 2.1 AA** on the careers + application flow; **GDPR** for EU applicants (privacy notice at collection, data minimization, documented 6–12 month retention, DPA with your ATS, SCCs/DPF for US transfers).

### 21.6 The open-source hiring edge

State your **upstream-contribution policy** explicitly on every engineering posting ("we allocate X% of eng time to KiCad upstream"), list the specific projects the role touches, link your public GitHub org (serious candidates *will* look — don't claim "cutting-edge C++20" if your repo is C++11), and reference KiCon/FOSDEM presence. Hiring from your contributor community yields **68% higher retention**. Motivators for OSS engineers: **rewards, respect (public credit), purpose** — your EVP must address all three; restrictions on publishing/upstreaming cause attrition in this population.

---

## 22. Open-source & community pages

### 22.1 Licensing & trademark (get this right)

KiCad is **GPLv3**; a WASM port is a modified version, so: modifications stay GPLv3, source available to recipients, notices/license retained, changes documented. KiCad libraries are **CC-BY-SA 4.0** (commercial use with attribution; *designs made with the tool* carry no license obligation). **Trademark:** no rights to the KiCad name/logo without permission — brand under a **distinct name** (not "KiCad Online/Cloud").

### 22.2 Building commercially on OSS without alienating the community

The HashiCorp→BSL→OpenTofu fork is the cautionary tale. Principles:
1. **Be transparent about the commercial model from day one** — never spring a license change on contributors.
2. **Upstream-first** (Red Hat's principle): offer non-product-specific improvements (WASM porting layer, KiCad rendering fixes, wxWidgets patches) to KiCad upstream before/instead of hoarding them. Run `scripts/kicad-diff-stats.sh` to keep the fork close to upstream (this repo already tracks this).
3. **Make the free/OSS layer genuinely excellent** — open-core fails when the free version feels like crippled bait. Monetize collaboration, hosting, enterprise — not the design tool itself.
4. **Credit and celebrate KiCad publicly** — name the developers, link kicad.org, sponsor KiCon.
5. **Watch COSS metrics:** GitHub stars, contributors, engagement, fork activity. Target "lighthouse" reference users first.

KiCad already has a large warm community (active forum, 1,800+ GitHub projects, annual conferences, 2,500+ donors). With a mature OSS base, your primary job is **demand curation** (Grafana's insight) — find the existing users before chasing new awareness.

### 22.3 Community pages & infrastructure

A `/community/` hub linking Discord, forum (Discourse — *searchable & SEO-indexed*, unlike Discord), GitHub Discussions, showcase, and events. Phased: **0–500 users** Discord + GitHub Discussions (with a clear "member promise" + rituals like weekly show-and-tell); **500–5k** add Reddit presence + a Discourse forum; **5k+** an ambassador/"Design Advocate" program (Figma model — early access, attribution, swag; keep it authentic, not paid-influencer). Keep the GitHub org clean: meaningful README, CONTRIBUTING.md, visible roadmap, license declaration.

### 22.4 DevRel

First DevRel hire = a working engineer who genuinely uses EDA tools, not a marketer who can explain them. Job: answer questions (Discord/forum/Reddit/SO with disclosed affiliation), write technical tutorials, speak at KiCon/FOSDEM/Hackaday Supercon/Maker Faire, nurture and amplify early advocates.

---

## 23. Trust, security & legal pages

The most important credibility lever for this audience — engineers are professionally cautious about tool risk (data loss, lock-in, vendor death).

### 23.1 The "your data is yours" commitment (name it on the site)

- "We store your designs as **native KiCad files**. Download all projects anytime, in the format KiCad uses."
- "**No proprietary formats. No lock-in.** Your schematics are `.kicad_sch` files, not rows in our database."
- "If we shut down tomorrow, your files open in desktop KiCad 9 unchanged."
- **Exports always available** (Gerber/BOM/PDF/STEP/native), even on free. Locking exports is a trust-destroyer.
- **Self-host option** with clear docs (Penpot's data-sovereignty positioning vs Figma is the model) — decisive for IP-sensitive teams.

This directly answers the EAGLE-deprecation and Altium-subscription scars in the market. It's a real differentiator vs Flux (proprietary format you can't open in desktop KiCad).

### 23.2 Security & trust page

State where data is hosted (provider/region), encryption at rest + in transit, access controls + audit logs, the self-host path (eliminates SaaS risk for sensitive designs), and any SOC 2 / ISO 27001 status. Open-sourcing the WASM porting layer is itself a trust signal — the community can audit that it doesn't exfiltrate designs. (The Excalidraw 122k★ vs tldraw 47k★ gap shows the community perceives and rewards genuine OSS licensing.)

### 23.3 Legal pages

Privacy Policy (GDPR + CCPA), Terms of Service, Cookie Policy/consent, DPA (for teams), Subprocessor list, and an `/security` or `/trust` page. Link all from the footer. A `/changelog` is also a trust asset — it signals active development and ranks for "[Product] features/updates."

---

## 24. Localization / internationalization

KiCad's user base is global (strong in EU, Japan, etc.). When you localize:
- Subdirectory structure (`/de/`, `/ja/`) over subdomains for authority consolidation.
- Full hreflang clusters (§14.6) with `x-default`.
- Localize the high-intent pages first: homepage, pricing, top comparison pages, top tutorials.
- Translate, don't machine-dump — engineers notice. The app UI itself inherits KiCad's existing translations, which is a marketing point ("available in N languages").
- Pricing: show local currency where feasible; be mindful of EU pay-transparency and VAT display rules.

---

## 25. Launch channels & GTM sequencing

### 25.1 Developer GTM doctrine

Bottom-up/PLG: the engineer adopts in their workflow, proves value, *then* procurement appears (Cursor didn't hire enterprise sales until past $200M ARR). **75% of B2B buyers self-educate before talking to sales** — the whole top-of-funnel must be self-serve. **Developers don't want to be marketed to** — they want to be educated, enabled, inspired, and shown what's behind the curtain. Hype backfires.

### 25.2 Channel playbooks

- **Hacker News (Show HN)** — highest signal for a technical tool. Title: "Show HN: [Product] – KiCad in your browser with real-time collaboration." Tone: builder-to-builder; go deep on the **WASM porting story** (intrinsically HN-interesting — "we compiled a 500K-LOC C++ EDA suite to run in a browser"). Link to the **live demo**, not a landing page. Tue–Thu 9 AM–12 PM ET; be in the comments for 60–90 min; treat critics as helping you convince observers. The technical-achievement post is valid independent of the commercial pitch.
- **Product Hunt** — secondary; broader startup/dev audience. Tue–Thu AM PT; demo video + collaboration GIFs; mobilize your existing list; respond all day. (Top dev-tool launches ~977 upvotes.)
- **Reddit** (r/KiCad, r/PrintedCircuitBoard ~180k, r/electronics, r/AskElectronics) — *authentic participation only*. Share a **project you designed** with the tool, or a genuine technical post; be a contributor for weeks before promoting; always disclose affiliation. Spam gets removed and burns bridges.
- **Lobste.rs** — invite-only, ~20k, very high signal; a deep WASM/wxWidgets/Asyncify technical story fits; not a product announcement.
- **dev.to / Hashnode** — SEO-amplified engineering posts (the porting story, CRDT/OT collaboration internals).
- **YouTube** — underutilized in PCB (Phil's Lab ~100k, Robert Feranec ~158k prove the audience). Full from-scratch board tutorials (rank on Google too), a 3-min real-time collaboration demo (never shown for KiCad before), teardown/rebuild build-logs, Shorts of impressive renders/DRC catches. Consider honest sponsored reviews with disclosure.
- **Hackaday.io / Hackster.io** — post real reference designs; sponsor a design contest with a fab house ("best PCB in [Product] → JLCPCB credits").
- **KiCon** — present the WASM port. The most legitimate entry into the KiCad community; builds credibility and goodwill while reaching your warmest audience.

### 25.3 Suggested sequence

**Pre-launch (wks 1–8):** clean GitHub org (README, CONTRIBUTING, license); Discord with rituals; 3 foundational posts (WASM porting story; beginner tutorial in-tool; the "data ownership" explainer); seed the gallery with 5–10 downloadable reference designs; private beta with 5–10 KiCad power users for honest feedback.
**Launch week (Supabase "launch week" cadence):** Day 1 Show HN (live demo, founders in comments) · Day 2 Reddit (share a project) · Day 3 Product Hunt · Day 4 dev.to WASM post · Day 5 YouTube collaboration demo.
**Post-launch:** ship one meaningful improvement/integration per week for 60 days (sustains search interest); monthly community design-showcase newsletter; plan a quarterly "Launch Week"; submit a KiCon talk; run a Hackster/PCBWay contest.

---

## 26. Design system, visual & brand

- **Show the product, not metaphors.** A real PCB canvas, real schematic, real multiplayer cursors. No stock photography, no abstract "innovation" art.
- **Performance is a design constraint** (§18): WebP/AVIF, explicit dimensions, self-hosted preloaded fonts, lazy-load below-fold media, never the LCP image.
- **Dark mode for product shots** reads "engineering tool" and matches how the editor likely looks; keep marketing copy high-contrast (AA).
- **Consistent component system** (buttons, cards, tables, code blocks, callouts) across marketing + docs + blog. Tables matter doubly here — they convert *and* get cited by AI (§17).
- **One dominant CTA style** site-wide; ghost style for secondary.
- **Motion with restraint** — a short looping multiplayer demo earns its weight; gratuitous scroll-jank hurts INP and annoys engineers.
- **Brand voice:** precise, confident, honest, builder-to-builder. The KiCad heritage is part of the brand — wear it with gratitude and credit, under your own distinct name/trademark.

---

## 27. Implementation roadmap & checklists

### 27.1 Phase 1 — Foundation (weeks 1–4)

- [ ] Decide product name (distinct from KiCad trademark), category label, positioning statement (§0)
- [ ] Stand up SSG marketing site (Astro/Next static), **separate from the WASM app**; app at `app.` or `/app` (§1.2)
- [ ] Homepage with full hero (§2.2) + below-fold structure (§2.3)
- [ ] `robots.txt` (allow AI crawlers, block `/app` `/api`), `sitemap-index.xml`, HTTPS, canonicals (§14, §17.3)
- [ ] Core schema: `Organization`, `SoftwareApplication`, `WebSite` (§14.5)
- [ ] GA4 + Search Console + Bing WMT; AI-search channel regex; funnel events incl. PQL (§20)
- [ ] Pass Core Web Vitals on every marketing page (§18)
- [ ] Pricing page (3 tiers, annual default, never gate collaboration) (§9)
- [ ] Public no-signup demo with a pre-loaded board (§10)
- [ ] Trust/"your data is yours" + Privacy/Terms/Security pages (§23)
- [ ] `llms.txt` (§17.3)

### 27.2 Phase 2 — Constellation & content (weeks 4–12)

- [ ] One page per major feature, with FAQ + FAQPage schema (§4)
- [ ] Use-case pages for each ICP (§5)
- [ ] Comparison pages: vs-kicad-desktop, altium-alternatives, eagle-alternatives, vs-easyeda, vs-flux (§6)
- [ ] Integration pages: GitHub, JLCPCB, DigiKey, Slack (§7)
- [ ] Templates gallery seeded with downloadable native-file designs (§8)
- [ ] Blog live; first cluster (pillar + 3–5 posts); the WASM-porting story; data-ownership explainer (§15)
- [ ] Social proof: logo wall, G2 setup, GitHub star count, curated testimonials (§11)
- [ ] Changelog page (§23.3)
- [ ] Convert headings→questions, paragraphs→answer-first, comparisons→tables for GEO (§17.2)

### 27.3 Phase 3 — Scale & GTM (months 3–6)

- [ ] Careers page + JobPosting schema + Ashby/Lever, with upstream-contribution policy (§21)
- [ ] `/community/` hub; Discord rituals; Discourse forum; GitHub Discussions (§22)
- [ ] pSEO program (only with a real dataset; staged batches) (§16)
- [ ] CRO program: ICE-prioritized tests, headline-first (§13)
- [ ] Launch sequence (Show HN → Reddit → Product Hunt → dev.to → YouTube) (§25)
- [ ] Wikidata/Crunchbase/Product Hunt/G2 entity layer; monthly AI-citation audit (§17.4)
- [ ] Localize top pages with hreflang (§24)
- [ ] Quarterly: refresh content `dateModified`, hreflang audit, comparison-page accuracy, CWV review

---

## 28. Benchmark & numbers reference

| Metric | Value |
|---|---|
| Attention above the fold | ~57% of viewing time |
| Reading level 5–7th grade vs professional | 12.9% vs 2.1% CVR |
| SaaS median landing CVR | 3.8% (good self-serve 4–10%) |
| Hero micro-social-proof lift | +63% |
| Visitor→trial (opt-in, organic) | ~8.5% |
| Trial→paid (no CC / CC required) | ~18% / ~49% |
| Freemium→paid | ~2.6% |
| PQL→paid vs MQL→paid | 15–30% vs 2–5% |
| First action <10 min → conversion | 3–4× |
| Dev-tool abandonment from setup time | 68% |
| Comparison page CVR | ~7.5% (~15× a blog post) |
| Form 5 vs 11+ fields | +120% completions |
| 11→4 fields | +160% completions |
| Personalized CTA | +202% |
| Three tiers vs two | 1.4× CVR; four+ −31% |
| "Most popular" badge | +25–40% selection |
| Annual vs monthly churn | 5–10% vs 30–50% |
| Optimal annual discount | 15–20% |
| "Cancel anytime" / guarantee / both | +23% / +16% / +34% |
| Video testimonials vs text | +80% |
| Interactive demo qualified-lead lift | +20–25% |
| LCP / INP / CLS "good" | ≤2.5 s / ≤200 ms / ≤0.10 |
| 0.1 s speed gain (retail) | +8.4% conversions |
| 1 s vs 5 s load | 2.5–3× CVR |
| Topic clusters | +30% organic traffic, 2.5× ranking longevity |
| AI Overviews coverage / zero-click searches | ~48% / ~69% |
| Princeton GEO: stats / citations(low-rank site) | +41% / +115% AI visibility |
| Passage 40–75 words / tables / listicles (AI citation) | 3× / 4.2× / 32.5% of citations |
| Schema (Article+ItemList+FAQ) AI citation | 1.8× vs Article alone |
| Gender-neutral JD | +29% applications, −41% cost/app |
| App <5 min vs >15 min completion | 12.5% vs 3.6% (3.45×) |
| Salary range in JobPosting | +15–25% apply rate |
| Hiring from contributor community | +68% retention |

*All figures are from the 2024–2026 industry/research sources compiled for this playbook (NN/g, Unbounce, First Page Sage, Pixelswithin, Evil Martians, Navattic, Baymard, web.dev/Google, Deloitte, Princeton GEO/KDD 2024, Semrush, Ahrefs, Google Search Central, Ongig, TODO Group, and others). They are directional benchmarks — validate against your own data once you have it.*

---

## 29. Appendix: snippets & copy templates

### 29.1 `robots.txt` (marketing root) — allows AI, blocks app

```
# --- AI retrieval / citation crawlers (allow = eligible for citation) ---
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Perplexity-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: Claude-User
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /

# --- AI training crawlers (allow = brand familiarity in model weights) ---
User-agent: GPTBot
Allow: /
User-agent: anthropic-ai
Allow: /

# --- Everyone: block app internals & user data ---
User-agent: *
Disallow: /app/
Disallow: /api/
Disallow: /account/
Disallow: /checkout/
Allow: /

Sitemap: https://yourdomain.com/sitemap-index.xml
```
> Also verify Cloudflare's "Block AI Bots" toggle / WAF rules are OFF for marketing pages — they override robots.txt.

### 29.2 `llms.txt` (at `/llms.txt`)

```markdown
# [Product]

> [Product] is a browser-based, collaborative PCB design tool: full KiCad
> compiled to WebAssembly, with real-time multiplayer editing. No install,
> native .kicad_* files, no lock-in.

## Core docs
- [Getting started](https://yourdomain.com/docs/getting-started): create your first board in the browser
- [Real-time collaboration](https://yourdomain.com/features/collaboration): how multiplayer editing works
- [KiCad import/export](https://yourdomain.com/features/kicad-import-export): open and save native KiCad files

## Category & comparisons
- [Browser-based PCB design](https://yourdomain.com/pcb-design/): what the category is
- [vs desktop KiCad](https://yourdomain.com/compare/vs-kicad-desktop/)
- [Altium alternatives](https://yourdomain.com/compare/altium-alternatives/)

## Optional
- [Changelog](https://yourdomain.com/changelog/)
- [Security & data ownership](https://yourdomain.com/security/)
```

### 29.3 `SoftwareApplication` JSON-LD (product/feature pages)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "[Product]",
  "description": "Browser-based collaborative PCB design tool. Full KiCad in the browser with real-time multiplayer editing. No install, native KiCad files.",
  "applicationCategory": "DesignApplication",
  "applicationSubCategory": "EDA Software",
  "operatingSystem": "Web Browser (Chrome, Firefox, Safari, Edge)",
  "url": "https://yourdomain.com",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD",
              "description": "Free for public projects" },
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "ratingCount": 312 },
  "featureList": [
    "Real-time collaborative PCB design",
    "Runs KiCad in the browser",
    "Schematic capture", "PCB layout editor",
    "Design Rules Check", "Gerber export", "Native KiCad file import/export"
  ],
  "screenshot": "https://yourdomain.com/images/editor.png",
  "author": { "@type": "Organization", "name": "[Company]" }
}
</script>
```

### 29.4 `FAQPage` JSON-LD (answers 40–60 words, answer-first)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question",
      "name": "Does it work with existing KiCad projects?",
      "acceptedAnswer": { "@type": "Answer",
        "text": "Yes. Import any KiCad 7.x/8.x/9.x project directly into the browser editor. Schematic symbols, footprints, and PCB layouts are preserved, and you can export back to native .kicad_* files at any time." } },
    { "@type": "Question",
      "name": "How does real-time collaboration work?",
      "acceptedAnswer": { "@type": "Answer",
        "text": "Multiple teammates open the same project URL at once. Edits sync live with colored presence cursors, similar to Google Docs. Projects autosave continuously, and everyone always sees the current state of the board." } }
  ]
}
</script>
```

### 29.5 `JobPosting` JSON-LD (each job page)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "Senior Software Engineer – PCB Layout Engine",
  "description": "<p>Full HTML job description…</p>",
  "datePosted": "2026-06-01",
  "validThrough": "2026-08-01T00:00:00",
  "employmentType": "FULL_TIME",
  "hiringOrganization": { "@type": "Organization", "name": "[Company]",
    "sameAs": "https://yourdomain.com", "logo": "https://yourdomain.com/logo.png" },
  "jobLocationType": "TELECOMMUTE",
  "applicantLocationRequirements": { "@type": "Country", "name": "US" },
  "baseSalary": { "@type": "MonetaryAmount", "currency": "USD",
    "value": { "@type": "QuantitativeValue", "minValue": 140000, "maxValue": 180000, "unitText": "YEAR" } }
}
</script>
```

### 29.6 Hero copy templates (swap to taste)

```
Eyebrow:  BROWSER-BASED · COLLABORATIVE · KICAD-NATIVE
H1:       Real PCB design, in your browser — together
Subhead:  Open any KiCad project and co-edit the schematic and board with your
          whole team in real time. Nothing to install. Your native files, no lock-in.
Primary:  Open the editor →
Second:   ⭐ Star on GitHub   |   Watch 2-min demo
Micro:    No credit card · Free for public projects · Used by 12,000+ engineers
```

### 29.7 Comparison-page H1 + verdict-table skeleton

```
H1:  [Product] vs Altium 365: which PCB tool should you choose?
Intro (honest): We build [Product], so we're biased — here's the straight comparison,
                including where Altium 365 is the better choice.

| Capability                 | [Product] | Altium 365 |
|----------------------------|-----------|------------|
| Runs in browser, no install| ✓         | ✗ (desktop)|
| Real-time co-editing       | ✓         | partial    |
| Opens native KiCad files   | ✓         | ✗          |
| Self-host option           | ✓         | ✗          |
| Free tier                  | ✓         | ✗          |
| Mature high-speed/RF tooling| growing  | ✓          |

### When to choose Altium 365
If you need [X mature capability] today, Altium is still ahead. Here's our honest take…
```

### 29.8 Sources

Full source URLs (NN/g, Unbounce, First Page Sage, Pixelswithin, Evil Martians, Navattic, Baymard, Google Search Central / web.dev, Deloitte/Google, Princeton GEO KDD 2024, Semrush, Ahrefs, Backlinko, Ongig, TODO Group, KiCad.org, and others) are preserved in the research briefs that informed this playbook. Re-verify fast-moving figures (GEO/AI-Overview stats, pay-transparency law thresholds, CWV thresholds) before relying on them externally — they change quarterly.

---

*This is a living document. Revisit §0 (positioning) and §28 (benchmarks) quarterly, and re-audit the GEO (§17), pay-transparency (§21.2), and CWV (§18) sections whenever the underlying platforms change.*
