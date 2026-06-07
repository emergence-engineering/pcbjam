# Competitive Analysis — Verified Synthesis (Browser-Based Collaborative KiCad/EDA)

Scope: synthesis of the **adversarially verified** subset of competitor positioning claims for a
browser-based, real-time-collaborative KiCad/EDA/PCB-design product. Every finding below survived a
3-vote verification pass against primary vendor sources (and, where noted, independent corroboration).
This file is the high-confidence "spine" of the analysis; the broader, lower-bar landscape detail
lives in the sibling files:

- `competitors-ai-automation-parts.md` — AI/automation/parts & adjacent players (Quilter, JITX, CELUS, SnapMagic, Allspice, etc.)
- `incumbent-desktop-eda-cloud-marketing.md` — incumbent desktop suites & their cloud add-ons (Altium, Cadence, Zuken, Fusion/Eagle, etc.)
- `brand-guide.md` — positioning/voice takeaways for our own landing page

Researched: June 2026. Currency caveats are listed at the end.

---

## Executive summary

The competitive field splits cleanly into three camps relative to our "KiCad in a browser, with
real-time collaboration" thesis. (1) **Flux.ai is the only verified head-on competitor** — it is
fully browser-based, requires no install, lists "Real-time collaboration" as a first-class platform
feature, and prices the collaborative tiers per editor — but it has pivoted its *headline* to
AI ("the world's first AI hardware engineer"), leaving the pure browser-native + multiplayer space
strategically under-claimed. (2) The **incumbents (Altium 365, Cadence OrCAD X)** explicitly position
as **desktop design + cloud collaboration**: their browser layer is view/review/markup only (2D
viewers, comments, version control), with actual PCB authoring locked to the Windows desktop — Altium's
own pricing tagline is literally "Design on your desktop. Collaborate in the cloud." (3) The
**open-source desktop tools (LibrePCB, Horizon EDA, Fritzing)** position *against* cloud, marketing
offline-first, no-account, no-real-time-collaboration workflows. A fourth adjacent camp (**Quilter**)
is an AI placement/routing automation layer that *complements* rather than replaces ECAD tools.
Net: a genuinely browser-native, real-time co-editing KiCad has exactly one direct rival (Flux), and
that rival is currently spending its marketing oxygen on AI — leaving "real browser-native multiplayer
EDA, on the toolchain people already trust" as an open positioning lane.

---

## Findings

### Finding A — Flux.ai is the single direct, head-on competitor: fully browser-based, no-install, real-time collaboration. **(Confidence: high)**

Flux is the only verified player that matches all three of our core attributes simultaneously
(browser-native, no install, real-time multi-user collaboration).

- **Browser-based + no install + real-time collaboration are all explicitly listed platform features.**
  flux.ai/p lists "Browser-based", "Real-time collaboration", and "No install" as core features, and
  states: "Browser-native design means no downloads, instant sharing, and access from any device" and
  "large, multi-layer designs run smoothly in a modern browser, with real-time collaboration built in."
  Independently corroborated (Electronics-Lab review "An AI Powered, Browser-Based PCB Design Tool";
  AllAboutCircuits framing it as "a Google Doc-style Collaboration Tool for Hardware Design").
  *(merges claims [0], [2], [4])*
- **Collaboration is real "multiplayer," concentrated in the paid tiers.** Pro and Teams are priced
  *per editor*; Pro explicitly allows "Up to 20 editors per project," and Teams adds "Shared team
  workspace" + "Centralized billing." Marketed as Google-Docs-style live multi-editing (live cursors,
  up to 20 simultaneous editors). *(merges claim [5])*
- **Strategic read:** Flux owns the browser-native + multiplayer combination today, but see Finding B —
  its *headline* no longer leads with it.

Sources: https://www.flux.ai/p · https://www.flux.ai/p/nb/pcb-design-software · https://www.flux.ai/p/pricing
(+ Electronics-Lab, AllAboutCircuits, GlobeNewswire corroboration).

### Finding B — Flux has pivoted its headline positioning to AI ("the world's first AI hardware engineer"), de-emphasizing the pure browser/collaboration story. **(Confidence: high)**

- Hero is "Design PCBs with AI" / "The world's first AI hardware engineer" / "If you can type, you can
  build." "Give Flux a job and it plans, explains, and executes workflows inside a full browser-based
  eCAD you can edit anytime." Self-described as "full ECAD rebuilt for the AI era: browser-based,
  collaborative... and guided by explainable AI."
- Corroborated by press: GlobeNewswire "'AI hardware engineer' Flux turns text prompts into circuit
  board designs" (Oct 2025) and "Flux, the AI hardware engineer, announces $37M in new investment"
  (Feb 2026). Founder interviews describe "the AI-Native Hardware Design Platform."
- **Strategic read:** browser + collaboration are now *supporting pillars* under an AI headline. This
  is the wedge — the "real browser-native multiplayer EDA" message is currently under-marketed by the
  only company that can actually claim it. *(merges claims [1], [2])*

Sources: https://www.flux.ai/p (+ GlobeNewswire, Yahoo Finance, pulse2.com interview).

### Finding C — Flux pricing: four tiers, per-editor on the collaborative tiers, 14-day trial. **(Confidence: high)**

Verified verbatim against the live pricing page (June 2026):

| Tier | Monthly | Annual | Notes |
|---|---|---|---|
| Starter | $20/mo | $16/mo | single-seat (NOT per-editor); 14-day trial |
| Pro | $142/mo/editor | $112/mo/editor | "BEST VALUE"; up to 20 editors/project; 14-day trial |
| Teams | $158/mo/editor | $120/mo/editor | all Pro features + shared workspace + centralized billing |
| Enterprise | custom | custom | contact sales |

CTA on the pricing page: "Launch Flux in the browser right now." The per-editor model is the key
pricing signal — collaboration is monetized per simultaneous editor, not per named seat.
*(merges claims [3], [4], [5])*

Source: https://www.flux.ai/p/pricing.

### Finding D — Incumbents (Altium 365, Cadence OrCAD X) position as "desktop design + cloud collaboration"; the browser layer is view/review/markup only, NOT authoring. **(Confidence: high)**

This is the most important structural finding for our wedge: every incumbent keeps PCB *authoring* on
the desktop and exposes only *review* in the browser.

**Altium 365 / Altium Designer (rebranding toward "Altium Develop"):**
- Positioning: "The Electronic Product Development & Collaboration Platform"; vision "The Future of
  Electronics Development is Co-creation"; tagline "the secure cloud platform connecting electronics
  design, supply chain, and manufacturing teammates to simplify collaboration and speed delivery."
  Collaboration/co-creation is the *central* differentiator. *(merges claims [6], [8], [9])*
- **But design is desktop-only.** The pricing-page hero is literally "**Design on your desktop.
  Collaborate in the cloud.**" The cloud layer is a shared workspace for review/commenting/version
  control; the browser Web Viewer is view/search/select/cross-probe/inspect — *not* edit. Altium
  Designer is a Windows desktop app (Win 10/11, ~2–2.5 GB install, DirectX 11 GPU). *(merges claims [7], [12], [13])*
- Social proof model: "Over 10,000 organizations" + security certs (count + trust, not logos).

**Cadence OrCAD X:**
- A hybrid desktop + cloud platform: "OrCAD X introduces powerful web viewers for PCB and schematic
  designs, allowing you to open projects from a shared workspace." Browser viewers are **2D, view-only**
  (3D on roadmap), no install and **no license required** to view. *(merges claim [10])*
- Markets real-time collaboration between desktop users and web participants: "Desktop users and web
  participants can collaborate effortlessly"; "annotate designs and provide feedback in real time."
  Page title: "Real-Time Design Review & Collaboration." *(merges claim [11])*
- **Caveat:** this is review/markup collaboration, not concurrent in-browser co-authoring.

**Wedge:** both incumbents validate the *demand* for cloud collaboration and "review in any browser,"
but neither offers in-browser design authoring — leaving real browser-native co-*editing* open.

Sources: https://www.altium.com/altium-365 · https://www.altium365.com/pricing ·
https://www.cadence.com/en_US/home/tools/pcb-design-and-analysis/orcad.html
(+ Altium Web Viewer docs; Cadence resources.pcb.cadence.com FAQ & 25.1 release pages; Hackster.io, Electronics-Lab).

### Finding E — Open-source desktop EDA tools (LibrePCB, Horizon EDA, Fritzing) position explicitly AGAINST cloud/browser/real-time collaboration. **(Confidence: high)**

These are the anti-cloud camp; their marketing is a mirror image of ours.

**LibrePCB:**
- "Free, cross-platform, easy-to-use EDA suite"; tagline "No costs. No restrictions. **No online
  account.** No unnecessary complexity." GPLv3, Windows/Linux/macOS, "can also be used fully offline."
- Cloud is framed as optional: section header "**Connected – if you like.**" (integrated library
  manager + PCB fab service) "But of course LibrePCB can also be used fully offline." Offline is the
  default; cloud is convenience. *(merges claims [14], [15])*

**Horizon EDA:**
- Cross-platform desktop (Linux + Windows only; no macOS, no browser/cloud build). Native C++/Gtkmm3
  app. *(merges claim [19])*
- Value prop = shared/maintainable **parts pool** + streamlined schematic capture + PCB layout with
  3D preview + manufacturing export. NO real-time collaboration anywhere on the site or docs.
  *(merges claim [20])*
- Its only "collaboration" is **git/file-based part-pool sharing** (JSON files, clone + merge request)
  plus community channels (GitHub Discussions, Matrix) — not in-app multi-user editing. *(merges claim [21])*

**Fritzing:**
- "Open-source hardware initiative that makes electronics accessible as a creative material for anyone...
  in the spirit of Processing and Arduino." Target: makers, education, hobbyists — explicitly *not* a
  professional cloud EDA tool. *(merges claim [16])*
- Downloadable desktop app (Windows/macOS/Linux), versioned releases (latest 1.0.7, April 15, 2026).
  Not browser-based; a WebAssembly port is only an open *request* (issue #3936), not shipped.
  *(merges claim [17])*
- Collaboration model is **asynchronous community/gallery sharing** ("document... share them with
  others, teach electronics in a classroom"); no real-time, cloud-editing, or co-editing angle.
  *(merges claim [18])*

**Wedge:** these tools concede the entire cloud/real-time/browser space. They compete on
free/offline/privacy/ownership — which is also a *counter-narrative we must answer* (privacy,
no-account, offline) for users who distrust cloud.

Sources: https://librepcb.org/ · https://horizon-eda.org/ (+ docs.horizon-eda.org, GitHub) ·
https://fritzing.org/ (+ blog.fritzing.org, GitHub, Wikipedia).

### Finding F — Quilter is an adjacent AI placement/routing automation layer that complements (does not replace) ECAD — including KiCad — rather than competing on the browser/collaboration axis. **(Confidence: high)**

- Positioning: "Quilter is physics-driven AI that automates PCB placement and routing" / "PCB Layout
  in Hours, Not Months." It is **not** a full EDA environment and not an AI schematic generator.
  *(merges claim [22])*
- Operates as a complement: "Upload Altium, Cadence, Siemens, or KiCAD projects directly," and
  "returns files in the same format as you submitted" — explicitly "a layout acceleration layer, not a
  replacement for your ECAD environment." Users keep their CAD tools for schematic capture, final DRC,
  docs, and fab outputs. *(merges claim [23])*
- **Strategic read:** Quilter is a *potential partner/integration*, not a competitor. It also models
  the modern outcome-based pricing narrative (pay per approved design, scale by pin count not seats)
  that the field is adopting. Notably KiCad is already a first-class supported format — a hook for us.

Source: https://www.quilter.ai/ (+ docs.quilter.ai, workflow page).

---

## Cross-cutting positioning takeaways (for our own landing page)

1. **"Real browser-native co-editing" is the open lane.** Flux can claim it but leads with AI;
   incumbents only do browser *review*; OSS tools opt out entirely. The crisp message
   "edit (not just view) PCBs together, live, in the browser" is currently unclaimed at the headline level.
2. **"On KiCad" is a differentiator no rival has.** Flux/Altium/Cadence are proprietary formats;
   our angle is the open KiCad toolchain people already trust + collaboration on top — no lock-in, no
   re-learning, no data hostage.
3. **Per-editor / per-seat pricing is the collaboration-monetization norm** (Flux Pro/Teams per editor).
   The market is also experimenting with outcome-based pricing (Quilter pay-per-result). Pick a lane
   deliberately and contrast it.
4. **Answer the OSS counter-narrative.** LibrePCB/Horizon/Fritzing market no-account + offline + privacy.
   A cloud product must proactively address data ownership/export/privacy to win their skeptical users.
5. **Vocabulary to adopt or counter:** "browser-native, no install," "Google-Docs-style multiplayer,"
   "review in any browser," "co-creation," "design on your desktop / collaborate in the cloud"
   (a tagline we can directly invert: "design *and* collaborate in the browser").

---

## Caveats & time-sensitivity

- **Researched June 2026; vendor marketing changes fast.** Flux in particular has repositioned at least
  twice (browser-native Figma-for-hardware → AI-native) and raised $37M in Feb 2026; its headline could
  shift again. Altium is mid-rebrand (Altium 365 → "Altium Develop"/"Altium Agile"/"Octopart
  Discover"/"Altium Designer"); tier names and page copy are in flux.
- **OrCAD X browser viewers are recent (Q2 2025 launch).** 3D browser view was on the roadmap, not
  shipped, at time of research — re-check if positioning OrCAD as desktop-only.
- **Pricing figures are point-in-time** (Flux verified verbatim June 2026). Treat all dollar amounts as
  current-as-of-research, not durable.
- **Some primary landing pages returned HTTP 403 to automated fetch** (cadence.com/.../orcad.html,
  fritzing.org/) — those findings were confirmed via the relevant vendor sub-pages, search index of the
  exact page, and independent corroboration rather than a direct fetch of the canonical URL.
- **A refuted claim is excluded:** the assertion that "OrCAD X OnCloud's *core* positioning is
  cloud-workspaces-from-anywhere as the *primary* differentiator" failed verification (0-3). OrCAD X's
  primary identity remains a desktop tool with a cloud/web *review* layer, not a cloud-first product.
- **Coverage gap:** this verified synthesis confirms Flux, Altium 365, OrCAD X, LibrePCB, Horizon EDA,
  Fritzing, and Quilter. The other named competitors (CircuitMaker, EasyEDA, Fusion/Eagle, Upverter,
  Allspice, Zuken, DipTrace, Tinkercad Circuits, SnapMagic/SnapEDA, CELUS, Valispace, Aisler, JITX) are
  covered in the sibling files at lower verification bar but did not have claims that cleared the 3-vote
  adversarial pass in this batch.

---

## Open questions

1. **Does Flux support real-time co-editing on the free/Starter tier, or only on per-editor Pro/Teams?**
   Verified data shows multiplayer concentrated in paid tiers, but the exact free-tier collaboration
   limit (e.g., single-editor projects vs. read-only sharing) is unconfirmed.
2. **Will OrCAD X (or Altium) ship in-browser *authoring* (not just review)?** Both have browser viewers
   and roadmap items (e.g., OrCAD 3D view); if either moves to in-browser editing, our wedge narrows.
3. **What is the verified positioning of the second-tier browser/cloud players (EasyEDA, CircuitMaker,
   Upverter, Allspice)?** None cleared the 3-vote bar here; EasyEDA in particular (browser-based, free,
   JLCPCB-backed) could be a closer direct competitor than the incumbents and warrants a dedicated pass.
4. **How are rivals pricing collaboration specifically (per-editor vs. per-seat vs. outcome-based)?**
   Flux (per-editor) and Quilter (per-result/pin-count) are verified; the broader market's
   collaboration-pricing norm is not yet established from verified sources.
