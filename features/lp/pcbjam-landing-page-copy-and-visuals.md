# PCBJam — Landing Page Copy & Visuals Spec

> **What this is.** A build-ready, section-by-section outline of *copy* (verbatim-ready) and
> *visuals* (with real asset paths) for the **PCBJam** marketing site and its supporting pages.
> It synthesizes the competitive research in this folder (`competitor-landing-pages.md`,
> `competitive-analysis-synthesis.md`, `brand-guide.md`, `marketing-site-playbook.md`,
> `landing-page-best-practices.md`) with **Emergence Engineering's** existing brand, voice, and
> asset library (the `blog/` repo one level above this project root).
>
> Generated 2026-06-07. Treat copy as a strong first draft to edit, not gospel. Re-verify any
> external claim/number before publishing (see the point-in-time caveats in the research files).

---

## 0. Locked decisions (the brief)

These four choices were confirmed by the founder and drive everything below:

| Decision | Choice | Consequence for the page |
|---|---|---|
| **Product name** | **PCBJam** | Standalone brand that sits *on top of* KiCad. We borrow KiCad's trust by attribution ("built on KiCad"), not by putting "KiCad" in our product name — which keeps us clear of KiCad's trademark (see `brand-guide.md` §10). The "jam" metaphor (a session you invite people into) is the spine of the collaboration story. |
| **Launch status** | **Waitlist / early access** | The hero's job is **email capture**, not "start designing." There is no live in-browser editor on the page yet, so the **centerpiece is a looping demo video/GIF** of real multiplayer editing, not an embedded app. Every major CTA funnels to the waitlist. |
| **Product vs. consulting** | **Product-first, EE credit** | The page is ~100% about PCBJam. **Emergence Engineering appears as (a)** a quiet "Built by" credit in the header/footer, **(b)** one dedicated lower-page section that doubles as the consulting hook, and **(c)** a supporting `/built-by-emergence` page. Consulting never competes with the waitlist CTA above the fold. |
| **Open / pricing** | **Open + free to start, pricing later** | Lean hard into the **open-format / self-host / no-lock-in** pillar (our biggest wedge vs. Flux/Altium). Show **"Free to start"** but **no price table** yet — a short "How we'll make money (and what stays free)" block instead, to pre-empt the "is this going to get rug-pulled?" worry. |

> **Email note.** The company's real contact address in code is **`contact@emergence-engineering.com`**
> (hyphenated — the brief said `emergenceengineering.com` without the hyphen, which doesn't match the
> codebase or `viktor.vaczi@emergence-engineering.com`). This spec uses the **hyphenated** address
> everywhere. Confirm before publishing. PCBJam itself should get its own inbox too — suggest
> **`hello@pcbjam.com`** / **`waitlist@pcbjam.com`** so product mail and consulting mail don't mix.

---

## 1. The one-sentence positioning (north star)

> **PCBJam is the open-source PCB design tool that runs in your browser and lets your whole team
> edit the same board together, live — no install, no lock-in, free to start.**

**The wedge (the single sentence we win on):** PCBJam is the only PCB tool that is *browser-native*,
*truly real-time multiplayer*, **and** *open* — Flux's convenience without the lock-in or the
$112–158/editor bill, KiCad's power without the install, and live co-editing that **no EDA tool,
desktop or cloud, actually delivers today**.

Supporting wedge points, in priority order (use these as the feature-pillar order too):
1. **True multiplayer** — your whole team, the same board, the same second. The only one.
2. **Open & yours** — real KiCad format, self-hostable, no lock-in. (vs. Flux/EasyEDA/Altium cloud traps)
3. **Zero install, any device** — a browser tab. Mac, Linux, Chromebook, iPad. (vs. all Windows-only desktop pros)
4. **Real KiCad, not a toy** — the actual engine compiled to WebAssembly. (answers "browser EDA = toy")
5. **AI when you want it, never a paywall** — contrarian, opt-in, calm. (vs. the AI-first crowd)

---

## 2. Voice & tone for PCBJam

A deliberate fusion (see `competitor-landing-pages.md` §4 "Tonal opening"):

- **OSS-honest credibility** (the LibrePCB/KiCad register) + **startup energy** (the Flux register),
  warmed by **Emergence Engineering's own playful streak** ("Katy and Matt editing the same page? Not
  a problem." / "Let's press the launch button. Shall we? :D").
- **Plain and precise.** Say what it does. *"Open a `.kicad_pcb` from a link. Two people edit it at
  once."* — not *"Unleash your design potential."*
- **Confident, not hype.** Verbs and real file names over adjectives. The audience reads monospace
  fluently — `board.kicad_pcb`, `X 152.4 Y 96.0`, `R` to route are on-brand.
- **Respect the heritage.** "Built on KiCad," never "we are KiCad." Attribute, don't appropriate.
- **The jam metaphor, used lightly.** "Start a jam," "who's in the jam," "jam on a board together."
  Don't overdo it — one or two touches per page, the engineering stays serious.

**Words to adopt / invert from competitors:** "browser-native, no install," "Google-Docs-style
multiplayer." Flagship inversion of Altium's tagline *"Design on your desktop. Collaborate in the
cloud."* → **"Design *and* collaborate, right in the browser."**

---

## 3. Brand & design tokens (from `brand-guide.md`)

The existing Astro site (`site/`) is **dark-first**, zero-JS, zero-web-font. Keep that.

```
PALETTE
  Primary (Circuit Blue)  brand 500 #4f7cff · button 600 #2f57f5 · favicon 700 #1d4ed8
  Signal  (Green / live)  text 400 #32d583 · fill 600 #039855   ← "online", presence, success
  Ink     (neutrals)      bg 950 #0b1020 · surface 900 #11182e · border 800 #233052
                          text 100 #e7ecf5 · muted 400 #9aa6c0
  Presence (peers)        #818cf8 #38bdf8 #2dd4bf #4ade80 #fbbf24 #fb923c #fb7185 #c084fc
TYPE   sans = system-ui stack · mono = ui-monospace (file names / coords / stats / shortcuts)
RADIUS 6 / 10 / 16 / full   ·   MAX-W content 64rem
MOTION 120 / 200 / 360ms · ease cubic-bezier(0.2,0.8,0.2,1) · honor prefers-reduced-motion
MOTIFS faint blueprint dot-grid bg · 45°/right-angle copper traces as accents · real screenshots
       with MULTIPLE CURSORS > illustrations · mono code/file chips as first-class UI
```

**Note for EE consulting blocks:** Emergence Engineering's own brand uses an **orange** accent
("FROM **IDEA** TO **APP** TO **MARKET**" with the keywords in orange). To keep PCBJam's identity
clean, render the EE credit/section in PCBJam's palette but you may let the **EE logo keep its
original colors** as a "guest brand" — that visual shift actually *helps* signal "this is the makers,
not the product."

---

## 4. Asset inventory — what already exists vs. what to produce

### 4a. Reusable SVGs from the `blog/` repo (real, on disk today)

Source root: `/Users/V/IdeaProjects/blog/public/`. Copy the ones you use into
`site/public/` (suggest `site/public/ee/` for EE-brand assets, `site/public/icons/` for generic).

**Emergence Engineering brand (for the credit + consulting section + EE page):**
| Asset | Path | Use |
|---|---|---|
| EE wordmark (611×111) | `public/ee-logo.svg` | Footer "Built by" lockup, EE consulting section header |
| EE icon/mark (compact) | `public/lp/ee_logo.svg` | Header credit chip, favicon-adjacent, small lockups |
| Stripe Verified Partner | `public/lp/stripe.svg` / `public/stripe.svg` | EE trust badge in consulting section |

**EE service & process icons (for the consulting section + `/built-by-emergence`):**
`public/lp/software.svg` (full-stack), `lp/ai.svg` (AI/LLM), `lp/fintech.svg` (payments),
`lp/rich_text.svg` (editors), `lp/collab.svg` (YJS collaboration — **also reusable for PCBJam's
multiplayer pillar**), `lp/ppc.svg` (marketing). Process journey: `lp/idea.svg`, `lp/plan.svg`,
`lp/prototype.svg`, `lp/validate.svg`, `lp/product.svg`. Plus `public/consulting.svg`,
`public/coaching.svg`, `public/training.svg`, `public/construction.svg`.

**EE client logos (social proof on the consulting section / EE page):**
`public/lp/`: `axdraft.svg`, `filtered.svg`, `memrise.svg`, `swaralink.svg`, `skiff.svg`,
`lex.svg`, `chapterly.svg`. (These map to real testimonials — see §13 and `referenceData.ts`.)

**Generic / dual-use (good for PCBJam itself):**
| Asset | Path | Use on PCBJam page |
|---|---|---|
| Collaboration illustration | `lp/collab.svg` | Multiplayer pillar / "Together" sections |
| Yjs logo | `lp/yjs.svg` (or `public/yjs.svg`) | "Under the hood: CRDT sync powered by Yjs" |
| GitHub mark | `lp/github.svg`, `public/github-mark.svg` | OSS links, star count, footer |
| Mail / message | `lp/mail.svg`, `lp/message.svg` | Waitlist + contact affordances |
| Arrows | `lp/arrow_outward.svg`, `lp/right_arrow.svg`, `public/arrow-next.svg` | CTA/link affordances |
| "You are here" map | `lp/you_are_here.svg`, `lp/you_are_here_mobile.svg` | **positioning-map visual** (see §9) — repurpose to plot PCBJam vs. desktop/cloud/OSS quadrants |
| Section divider dot | `lp/divider_dot.svg` | section rhythm |
| Play button | `public/play_circle_filled-24px.svg` | demo-video poster overlay |
| Tech logos (EE toolbox) | `node.svg`/`Node.js_logo.svg`, `react.svg`, `aws.svg`, `firebase.svg`, `supabase.svg`, `openAi.svg`, `stripe.svg`, `prosemirror.svg`, `graphql.svg`, `postgres.svg`, `docker.svg`, `pytorch.svg`, `tensorflow-2.svg`, `python-logo-notext.svg`, `golang-official.svg` | EE "technology toolbox" strip on consulting section/page |

**Existing PCBJam/site assets:** `site/public/favicon.svg` (blue rounded-square "K" — treat as
placeholder; replace with a PCBJam mark, keep rounded-square + blue + simple glyph per brand guide).

### 4b. NEW visuals to produce (do not exist yet — this is the production checklist)

> ⚠️ The single most important asset on the entire site is **the multiplayer demo**. Budget for it
> first. No competitor can show real simultaneous PCB co-editing — so our showing it *is* the moat.

1. **PCBJam logo / wordmark** — new brand mark + wordmark. Rounded-square glyph, Circuit Blue.
   Consider a glyph that fuses a PCB pad/trace with a "play/jam" cue. Deliver SVG (light + dark).
2. **★ Multiplayer demo (centerpiece)** — looping, muted, autoplay-on-scroll MP4/WebM **+ a static
   poster** (and a lightweight GIF fallback). Shows: one real board, **2–3 colored live cursors**
   (use the presence palette), each editing/routing simultaneously, a pinned comment, presence
   avatars top-right. 8–15s loop. This is the "Figma moment." Caption it with real mechanics.
3. **Hero board still** — a clean, dense-but-legible board render (dark canvas, copper traces,
   pads, silkscreen) with 2 presence cursors composited in, as the hero's right-column/under-fold image.
4. **Product screenshots (real, annotated):** (a) PCB layout editor, (b) schematic capture (Eeschema),
   (c) 3D board view, (d) DRC/ERC results panel, (e) BOM / Gerber export. Used in the "Real KiCad,
   not a toy" capability proof.
5. **Positioning quadrant graphic** — Browser×Open×Multiplayer; can be hand-built on top of the
   `you_are_here.svg` motif. (See §9.)
6. **"How a jam works" 3-step diagram** — Open a board → Invite your team → Design & export together.
7. **External logos to source (with care for usage rights):** KiCad logo (for "Built on KiCad"
   attribution — follow KiCad trademark guidelines), migration-source logos (EAGLE, Altium, CADSTAR,
   OrCAD), fab-partner logos (JLCPCB, PCBWay, OSHPark, AISLER). Use grayscale/monochrome treatment.
8. **OG/social share images** per page (1200×630) and an updated favicon.
9. **(Optional) "real board shipped" photo** — a physical PCB designed entirely in PCBJam, when one exists.

---

## 5. Global elements

### Header / nav (sticky, minimal)
- **Left:** PCBJam logo (`§4b.1`). Optional tiny mono chip beside it: `built on KiCad`.
- **Center/right links:** `How it works` · `Open & yours` · `Roadmap` · `Blog` · **`Built by Emergence Engineering`** (text link) · `GitHub ★` (`lp/github.svg` + live star count when available).
- **Right CTA button:** **`Join the waitlist`** (primary, `primary-600`) → scrolls to / opens the email capture.
- Mobile: hamburger (`blog/public/lp/menu.svg` exists if you want it); CTA stays visible.

### Persistent waitlist mechanism
- One reusable component: email input + button. Placeholder `you@company.com`, button
  **`Join the waitlist`**. Microcopy under it: *"Early access invites go out in waves. No spam — just
  a heads-up when your seat is ready."* On submit → inline success state (see `/thanks`, §16).
- Appears in: hero (§7), mid-page reinforcement (§14 final CTA), and the footer.

### Footer
- **Col 1 — PCBJam:** logo + one-liner ("KiCad, in your browser. Now multiplayer.") + GitHub, blog, roadmap links.
- **Col 2 — Product:** How it works · Open & yours · Roadmap · Waitlist.
- **Col 3 — Built by:** **EE wordmark** (`public/ee-logo.svg`) + *"PCBJam is a project by Emergence
  Engineering, a full-stack software studio. Need something hard built? `contact@emergence-engineering.com`."*
  + links to `/built-by-emergence` and emergence-engineering.com.
- **Col 4 — Legal:** Privacy · Terms · Cookies (pages already exist in `site/src/pages/`).
- **Bottom bar:** `© 2026 Emergence Engineering` · *"Built on the open-source **KiCad** EDA suite.
  Not affiliated with or endorsed by the KiCad project."* (attribution + trademark safety) · link to kicad.org.

---

## 6. Page map

| Page | Path | Purpose | Status |
|---|---|---|---|
| **Landing** | `/` | The waitlist conversion page (§7–§15) | replace placeholder `index.astro` |
| How it works / Demo | `/how-it-works` | Long-form demo + the multiplayer story + capability proof | new |
| Open & yours | `/open` | Data-sovereignty / self-host / open-format deep dive (our wedge) | new |
| Roadmap & status | `/roadmap` | Honest "what works today / what's next" — credibility for a waitlist product | new |
| Built by Emergence Engineering | `/built-by-emergence` | The **consulting** page: who built PCBJam, what else EE builds, case studies, hire-us CTA | new |
| Blog | `/blog`, `/blog/[slug]` | Already scaffolded; engineering posts (WASM, CRDT, KiCad internals) for GEO/SEO | exists |
| Thanks | `/thanks` (or inline) | Post-waitlist confirmation + share + EE soft-pitch | new |
| Privacy / Terms / Cookies | existing | Legal | exist |

---

# PART A — The landing page (`/`), section by section

Each section below gives **Goal**, **Copy** (verbatim-ready; pick among options where offered),
**Visual** (real asset path or `PRODUCE:`), and **Pattern** (what competitor convention it
borrows/beats, from the research).

---

## 7. Section 1 — Hero

**Goal.** In one screen: say what PCBJam is, land the multiplayer wedge, and capture an email.
This is a waitlist page — the hero's primary conversion is the email field, *not* "open the app."

**Copy.**
- **Eyebrow (mono, muted):** `PCBJam · built on KiCad`
- **H1 (primary):** **KiCad, in your browser — now multiplayer.**
  - *Alt A:* **Design PCBs together, live, in your browser.**
  - *Alt B:* **The PCB tool that opens in a tab and edits with your team.**
- **Subhead (`text-lead`):** The PCB design tool millions trust — now zero-install and
  collaborative. Open a board in a tab, invite your team, and edit the same schematic and layout
  together in real time. Open format. No install. Free to start.
- **Primary CTA:** email input (`you@company.com`) + **`Join the waitlist`**
- **Microcopy under CTA:** *Early access is rolling out in waves. We'll email you when your seat opens — no spam.*
- **Secondary CTA (text link w/ play icon):** **`Watch the 90-second demo →`** (scrolls to §8 / opens video)
- **Trust whisper (tiny, under CTAs):** `Open source` · `Your files stay in KiCad format` · `Runs on Mac, Linux, Chromebook, iPad`

**Visual.**
- `PRODUCE:` the **multiplayer demo loop** (§4b.2) as the hero centerpiece — autoplay, muted, looping,
  with the play-button poster (`public/play_circle_filled-24px.svg`) for reduced-motion/poster state.
  If the full loop isn't ready, use the **hero board still with 2 presence cursors** (§4b.3).
- Background: faint **blueprint dot-grid** + a couple of **copper-trace** accents (brand-guide §7).

**Pattern.** *Borrows* the verb-first, zero-friction hero of Flux/CircuitLab. *Beats* them by leading
with **KiCad trust + multiplayer** instead of AI (Flux leads "Design PCBs with AI"; we deliberately
don't). The hero *is* the product demo — steals KiCanvas's "show the real thing instantly" instinct,
adapted to a video because the live editor isn't public yet.

---

## 8. Section 2 — Trust / scale stat bar

**Goal.** Immediately answer "is this real?" with numbers we can actually stand behind (ours are
real and verifiable, unlike vendor-asserted user counts).

**Copy (4 stats, mono numerals).** Fill the real figures; placeholders shown:
- **Millions** of KiCad users worldwide
- **The largest** open component & footprint library in EDA
- **`N,000`** GitHub stars on KiCad *(or PCBJam's own once it has them)*
- **`100%`** open file format — your `.kicad_pcb` / `.kicad_sch`, never a proprietary cloud blob

> Only claim counts you can defend. If PCBJam's own GitHub/stars are tiny pre-launch, lean on
> **KiCad's** inherited scale and the open-format fact, and add a PCBJam-native number ("boards
> opened in beta") once it exists.

**Visual.** Thin full-width band, `bg-soft`. Optional small GitHub mark (`lp/github.svg`) by the
star stat. Keep it text-forward.

**Pattern.** *Borrows* EasyEDA/Flux/Tinkercad's user-count bar; *beats* them because our numbers are
real, open, and inherited from KiCad — a credibility base every proprietary rival lacks.

---

## 9. Section 3 — The multiplayer centerpiece ("Figma for PCB")

**Goal.** The emotional + rational core of the page. Show, don't tell: two people editing one board,
live. This single visual does more than any paragraph.

**Copy.**
- **Eyebrow:** `Real-time, not "real-time-ish"`
- **H2:** **Your whole team. One board. The same second.**
- **Body:** Everyone else who says "real-time collaboration" means comments, check-out locks, or a
  read-only viewer. PCBJam means **live co-editing**: shared cursors, presence, and conflict-free
  edits on the *same* schematic and layout — the way you already work in Google Docs and Figma.
  Route a trace while a teammate places parts on the other side of the board. No emailing files. No
  "who has it checked out?"
- **Sub-points (3 short, icon'd):**
  - **Live cursors & presence** — see who's here and where they're working.
  - **Conflict-free editing** — CRDT sync (Yjs) merges everyone's edits, no overwrite wars.
  - **Pin a comment to a pad** — review and resolve right on the canvas.
- **Caption under the demo (mono):** `2 editors · live cursors · one board.kicad_pcb · no merge step`

**Visual.**
- `PRODUCE:` the big **multiplayer demo** (§4b.2), running large here if it was a still in the hero.
- Supporting: `lp/collab.svg` and/or `lp/yjs.svg` for the "powered by Yjs CRDT" line.

**Pattern.** *Borrows* Flux/Figma framing; *beats every EDA tool alive* — none can show real
simultaneous PCB editing (Flux = comments/permissions, EasyEDA = lock/checkout, OrCAD = 2-user cap,
Altium = desktop commit, AllSpice/tscircuit = async git). This is the sharpest wedge in the research
(§7.1). **Be honest about what "live" means** to avoid the same "they're bluffing" critique we level
at others (research §10.6).

---

## 10. Section 4 — Three core value pillars

**Goal.** Three sharp claims, not eight diffuse ones. Each pillar = one wedge point.

**Copy (3 cards).**
1. **Runs in a browser tab.** Zero install, zero toolchain. Mac, Linux, Windows, Chromebook, iPad —
   if it has a modern browser, it designs PCBs. *Visual:* `PRODUCE:` small device-array glyph, or reuse `blog/public/icons/responsive.svg`.
2. **Truly multiplayer.** Live cursors, presence, and conflict-free co-editing on the same board.
   Plus pin-to-canvas comments for review. *Visual:* `lp/collab.svg`.
3. **Open & yours.** Real KiCad format in, real KiCad format out. Self-host it, run it offline as a
   PWA, or use our cloud — your files are never held hostage. *Visual:* `PRODUCE:` open-lock / format glyph; `lp/github.svg` accent.

**Visual.** 3-card grid (existing `.card` style in `global.css`). Line-style icons, `currentColor`, Circuit Blue.

**Pattern.** *Borrows* the universal 4–8-card feature grid (Flux/Altium 365/OrCAD); we keep it to
**three** and make each a differentiator, not a checkbox.

---

## 11. Section 5 — How a jam works (3 steps)

**Goal.** Make the workflow concrete and show collaboration is present at *every* step (not bolted on).

**Copy.**
- **H2:** **From link to layout in three moves.**
- **Step 1 — Open a board.** Paste a link, drag in a `.kicad_pcb`, or pull from GitHub. It opens in
  seconds — no install, no account wall to *look*.
- **Step 2 — Start a jam.** Share the URL. Teammates join with live cursors and presence. Everyone
  sees the same board update in real time.
- **Step 3 — Design, route & export — together.** Schematic capture, PCB layout, DRC/ERC, 3D, BOM,
  and Gerbers — the full flow, then hand off to any fab. Your call.

**Visual.** `PRODUCE:` 3-step horizontal diagram (§4b.6). Arrows: `lp/right_arrow.svg` /
`public/arrow-next.svg`. Step icons can be lightly adapted from `lp/idea.svg`/`lp/prototype.svg`/`lp/product.svg`.

**Pattern.** *Borrows* Flux's "Plan→Schematic→Layout→Manufacture" and CELUS's 3-step; ours emphasizes
**collaboration at every step**, not AI autonomy.

---

## 12. Section 6 — "Real KiCad, not a toy" (capability proof)

**Goal.** Defuse the #1 attack — *"browser EDA = toy / can't do real complexity."* (research §10.1)

**Copy.**
- **Eyebrow:** `The actual engine, compiled to WebAssembly`
- **H2:** **This is real KiCad — the whole thing.**
- **Body:** PCBJam isn't a web re-implementation with a fraction of the features. It's the genuine
  KiCad engine compiled to WebAssembly, running in your tab. Schematic capture. Multi-layer PCB
  layout. Design rule checks. 3D view. BOM and Gerber export. The same `.kicad_pcb` you'd open on the
  desktop — because it *is* the same tool.
- **Capability checklist (2-col, ✓):** Schematic capture (Eeschema) · PCB layout (Pcbnew) ·
  DRC / ERC · Interactive router · 3D board view · BOM export · Gerber / drill export · Footprint &
  symbol libraries · Net classes & constraints · Push-and-shove routing.

**Visual.** `PRODUCE:` 2–4 **real annotated screenshots** (§4b.4): layout editor, schematic, 3D,
DRC panel. Real copper, real pads, real coordinates in mono callouts. Screenshots > illustrations
(brand-guide §7).

**Pattern.** *Directly answers* the toy risk; *beats* CircuitLab/Tinkercad (sim-only) and KiCanvas
(view-only) by showing the complete stack. Don't ever let the page imply "simplified."

---

## 13. Section 7 — Open & yours (data-sovereignty wedge)

**Goal.** Own the anti-lock-in lane — empty at the intersection of cloud convenience (research §7.3).
This is what no cloud rival can copy and what answers the OSS skeptics' privacy fears.

**Copy.**
- **Eyebrow:** `No lock-in. No data hostage.`
- **H2:** **Design *and* collaborate in the browser — without surrendering your files.**
  *(deliberate inversion of Altium's "Design on your desktop. Collaborate in the cloud.")*
- **Body:** Cloud EDA tools trap your designs in proprietary formats and clouds you can't leave.
  Desktop open-source tools keep you free but strand you offline and solo. PCBJam refuses the
  trade-off: **real KiCad format** in and out, **self-host** it on your own server, run it **offline
  as a PWA**, and it's **open source**. Collaborate in our cloud when it's convenient — and walk away
  with every byte whenever you want.
- **Four chips:** `Open .kicad_pcb / .kicad_sch` · `Self-hostable` · `Offline PWA` · `Open source (GPL)`
- **Reassurance line (pre-empts rug-pull fear):** PCBJam rides KiCad — a project backed for decades
  by CERN, the KiCad Services Corp, and a global community. This isn't a VC bet that vanishes when the
  runway ends.

**Visual.** `lp/github.svg`, a self-host/server glyph (`PRODUCE:` or `blog/public/icons/cloud-computing.svg`),
open-format file chips in mono.

**Pattern.** *Beats* Flux/EasyEDA/Altium cloud lock-in head-on; *borrows* the freedom narrative from
LibrePCB/Horizon but pairs it with the cloud + collaboration they lack. Converts a risk
(cloud-privacy fear, research §10.3) into a strength.

---

## 14. Section 8 — Migration strip ("Coming from…")

**Goal.** Seize the live refugee moment — Autodesk **sunset EAGLE (EOL today, 2026-06-07)** and Zuken
is sunsetting CADSTAR. KiCad's native format is *the* migration target; we're the zero-install landing pad.

**Copy.**
- **H3:** **Coming from EAGLE, Altium, CADSTAR, or OrCAD?**
- **Body:** KiCad is where designs are migrating — and PCBJam opens them in a browser tab, free,
  with nothing to install. *Bring your board. Invite your team. Pick up where you left off.*
- **CTA:** `Join the waitlist →`

**Visual.** Grayscale/monochrome logo strip of migration sources (EAGLE, Altium, CADSTAR, OrCAD) →
arrow (`lp/arrow_outward.svg`) → PCBJam mark. `SOURCE:` external logos (§4b.7), monochrome treatment.

**Pattern.** *Borrows* DipTrace/Fusion's compatibility-logo strip; *seizes* the EAGLE-EOL/CADSTAR
moment (research §7.5), which is *timely as of the generation date*.

---

## 15. Section 9 — Positioning map (optional but high-impact)

**Goal.** Make the whitespace visceral — show, in one graphic, that PCBJam alone occupies
Browser × Open × Multiplayer.

**Copy.**
- **H3:** **Everyone picks two. We do all three.**
- **Caption:** Browser-native. Open & yours. Truly multiplayer. Flux is browser + collab but closed.
  KiCanvas is browser + open but read-only. LibrePCB is open + full but desktop-only. **PCBJam is the
  only one in the middle.**

**Visual.** `PRODUCE:` quadrant/Venn graphic, built on the **`lp/you_are_here.svg`** /
`you_are_here_mobile.svg` motif ("you are here" pin placed in the empty intersection). Plot Flux,
Altium 365, OrCAD X, KiCanvas, LibrePCB, EasyEDA around the edges.

**Pattern.** Visualizes the "empty quadrant" finding (research §7.2). A memorable, screenshot-able,
shareable asset — good for social/launch.

---

## 16. Section 10 — Built by Emergence Engineering (the credit + consulting hook)

**Goal.** The product-first consulting placement. Establish *who* built this (credibility for the
waitlist) **and** plant the consulting seed — without ever outshouting the product. This is the
section that wins EE consulting clients off PCBJam's traffic.

**Copy.**
- **Eyebrow:** `Who's behind PCBJam`
- **H2:** **We're Emergence Engineering. We build hard things in the browser.**
- **Body:** PCBJam exists because we got obsessed with a genuinely hard problem: running a full,
  native C++ EDA suite — and real-time multiplayer — entirely in a browser, on WebAssembly. That's
  the kind of work we do for a living. Emergence Engineering is a full-stack software studio (🇪🇺,
  remote-first) that builds WASM ports, real-time collaborative editors, AI features, and the
  payments and infrastructure behind them — for startups and scale-ups who need the hard parts done right.
- **Mini-proof row (mono/short):** `WebAssembly` · `Real-time collaboration (Yjs/CRDT)` ·
  `Rich-text & ProseMirror editors` · `AI / LLM features` · `Fintech & Stripe`
- **Social proof:** *"Trusted by teams at…"* + EE client logos (`lp/skiff.svg`, `lp/memrise.svg`,
  `lp/axdraft.svg`, `lp/lex.svg`, `lp/filtered.svg`, `lp/swaralink.svg`). One short testimonial,
  e.g. **Ben Whately:** *"For any new product, they're my go-to dev house. They work fast and to
  super high quality."*
- **CTA (secondary style, not competing with waitlist):** **`Need something hard built? → Talk to
  the team`** → `/built-by-emergence` (and `contact@emergence-engineering.com`).

**Visual.** EE wordmark `public/ee-logo.svg`; client logos row; optional `lp/collab.svg` or a small
"PCBJam is one of our projects" lockup. Keep it visually distinct (a `bg-soft` band) so it reads as
"the makers," not another product feature.

**Pattern.** *Borrows* the founder/maker-credibility halo (and EE's real testimonials/logos). Placed
**below** the core product story so it supports, never competes with, the waitlist. This is the
agreed "product-first, EE credit" weighting.

---

## 17. Section 11 — How we'll make money (trust block, replaces pricing)

**Goal.** No price table yet — but a waitlist audience *will* wonder "what's free, and will you
rug-pull me?" Answer it calmly and convert the answer into a trust signal.

**Copy.**
- **H3:** **Free to start — and the core stays open.**
- **Body:** The full editor and real-time collaboration are **free to start**, and the file format is
  open, forever. Later, we'll charge teams for the things teams actually need — private org
  workspaces, SSO and compliance, hosted storage, and optional AI assistance. The individual,
  open-source core isn't the thing we paywall. **No per-editor toll. No metered AI. No surprises.**
- **Contrast chip (optional, cheeky-but-true):** *Flux charges $112–158 per editor, per month. We
  don't.* *(verify current Flux pricing before publishing — point-in-time, see research §C)*
- **CTA:** `Join the waitlist →`

**Visual.** Simple three-icon row: `Free core` · `Open format` · `Paid only for team/enterprise
scale`. No table.

**Pattern.** *Borrows* the validated "free reviewers / paid authors, monetize team scale" model
(Altium 365 / AllSpice). *Beats* Flux's $112–158/editor and the sales-gated "request a quote" wall
(Cadence/Zuken) by being transparent about intent even pre-pricing. Pre-empts the OSS-sustainability
worry (research §10.5).

---

## 18. Section 12 — AI (deliberately small, opt-in)

**Goal.** Answer the AI table-stakes without making it our identity — the contrarian stance (research §7.4).

**Copy.**
- **H3:** **AI when you want it. Never a paywall, never a black box.**
- **Body:** Everyone else leads with an "AI hardware engineer." We lead with *you* and an open tool
  you control. AI assistance is on the roadmap as an **opt-in** helper — never metered by the token,
  never the thing standing between you and your own board.

**Visual.** Small, single line. `lp/ai.svg` if an icon is wanted — kept visually minor on purpose.

**Pattern.** *Contrarian placement* — low and calm, where every funded rival shouts AI at the top.
Differentiated precisely because the field is homogeneous on AI.

---

## 19. Section 13 — Final CTA

**Goal.** Last, dominant conversion. One job: get the email.

**Copy.**
- **H2:** **Be there when the first jam opens.**
  - *Alt:* **Open a board. Invite your team. Be early.**
- **Subhead:** Early access rolls out in waves. Join the waitlist and we'll save you a seat.
- **CTA:** email input + **`Join the waitlist`**
- **Reassurance:** *No spam. One email when your seat is ready. Unsubscribe anytime.*
- **Under it (tiny):** `Open source` · `Built on KiCad` · `Built by Emergence Engineering`

**Visual.** Full-width band, blueprint-grid bg, a couple of copper-trace accents. Big single button.
No demo gate, no second competing CTA.

**Pattern.** *Borrows* Flux's "If you can type, you can build / Get Started for Free" energy, retuned
to a waitlist ask.

---

# PART B — Supporting pages

---

## 20. `/how-it-works` (demo + deep story)

**Goal.** The long-form home for the demo and the full capability/collaboration story — where
"watch the 90-second demo" and curious skeptics land.

**Sections & copy:**
1. **Hero:** **"See PCBJam jam."** Subhead: *The whole flow — open, invite, design, export —
   in your browser, together.* Big embedded demo video (§4b.2, full length here). CTA: `Join the waitlist`.
2. **The collaboration deep-dive** — expand §9's three sub-points into short explainer blocks, each
   with a focused clip/GIF: live cursors & presence; conflict-free CRDT editing (Yjs); pin-to-canvas comments.
3. **The full toolchain** — the §12 capability checklist, each with a real screenshot (§4b.4).
4. **"Is the browser fast enough?"** — honest performance note (answers research §10.2). One short,
   confident paragraph + a clip of a heavy board staying responsive. Link to a technical blog post.
5. **FAQ** — "Is this really KiCad?" "Where do my files live?" "Can I self-host?" "Does it work
   offline?" "What does it cost?" "Is my IP safe?" (each answer reinforces a wedge).
6. **CTA band** — `Join the waitlist`.

**Visuals:** the demo video, focused clips, real screenshots, `lp/yjs.svg`, `lp/collab.svg`.

---

## 21. `/open` (data-sovereignty / self-host deep dive)

**Goal.** The full version of §13 for the privacy/IP-sensitive and OSS-skeptic segments (and good SEO
for "self-hosted PCB design," "open source browser EDA").

**Sections & copy:**
1. **Hero:** **"Your designs. Your format. Your servers if you want them."**
2. **Open format** — `.kicad_sch` / `.kicad_pcb` in and out; round-trips with desktop KiCad; export anytime.
3. **Self-host** — run PCBJam on your own infrastructure / air-gapped; what's required; who it's for
   (defense, aerospace, IP-sensitive teams — the segment Altium 365 CMMC/FedRAMP and JITX air-gap court).
4. **Offline PWA** — install it, design without a connection, sync when you're back.
5. **Open source** — license, GitHub, how to contribute; the durability/sustainability story (KiCad
   + KiCad Services Corp + CERN + community).
6. **CTA** — `Join the waitlist` + GitHub link.

**Visuals:** `lp/github.svg`, server/cloud glyphs (`blog/public/icons/cloud-computing.svg`),
open-format mono file chips, license badge.

---

## 22. `/roadmap` (honest status — credibility for a pre-launch product)

**Goal.** A waitlist product lives or dies on trust. A transparent "what works today / what's next"
is itself a conversion asset — it signals this is real and progressing.

**Sections & copy:**
- **Intro:** **"Where PCBJam is, honestly."** *We'd rather show you the seams than overpromise.*
- **✅ Works today** — (fill from the project's real state: PCB rendering, schematic, multiplayer
  editing demos, etc. — pull from the repo's WHATWORKS/test docs).
- **🚧 In progress** — current focus areas.
- **🗓️ Next** — upcoming.
- **CTA:** `Join the waitlist — we email at each milestone.`

**Visuals:** simple status chips (`signal-400` done, `warning` in-progress, `ink-400` planned);
`lp/divider_dot.svg` rhythm. Optionally pull live status from the repo.

> Source the actual capability list from this repo's `tests/WHATWORKS*`/feature docs so the page is
> truthful — don't invent feature claims.

---

## 23. `/built-by-emergence` (the consulting page)

**Goal.** The full consulting pitch for visitors who clicked the §16 hook. This is where PCBJam's
audience converts into **EE consulting leads**. Mirror Emergence Engineering's existing site voice
(the agent extracted it verbatim from `blog/`).

**Sections & copy (reuse EE's real copy):**
1. **Hero:** **"FROM IDEA TO APP TO MARKET."** (EE's own hero — keywords in orange.) Subhead: *We're
   a full-stack development team building scalable, high-performance software products and webapps.*
   Sub-line tying it back: *PCBJam is one of the hard things we built for ourselves.* CTA: **`Get a quote`** → `contact@emergence-engineering.com`.
2. **What we do (services grid)** — EE's six cards verbatim, with their icons:
   - **Full-Stack Web Development** (`lp/software.svg`)
   - **Rich Text Editors** (`lp/rich_text.svg`)
   - **YJS Collaborative UIs** (`lp/collab.svg`)
   - **AI Development** (`lp/ai.svg`)
   - **Fintech & Payments** (`lp/fintech.svg`)
   - **PPC & Marketing** (`lp/ppc.svg`)
3. **PCBJam as proof** — short case-study block: the problem (native EDA + multiplayer in a browser),
   the hard parts (WASM, asyncify, CRDT sync, performance), the result. Links back to `/how-it-works`.
4. **Technology toolbox** — logo strip: `node.svg`, `react.svg`, `prosemirror.svg`, `firebase.svg`,
   `supabase.svg`, `openAi.svg`, `aws.svg`, `yjs.svg`, `stripe.svg` (+ `docker.svg`, `postgres.svg`,
   `graphql.svg`, `pytorch.svg` as depth).
5. **References / testimonials** — EE's real client logos + quotes (Greg Detre, Marc Zao-Sanders,
   Ben Whately, Andrew Milich/Skiff, Oleg Zaremba/Axdraft). Logos: `lp/skiff.svg`, `lp/memrise.svg`,
   `lp/axdraft.svg`, `lp/lex.svg`, `lp/filtered.svg`, `lp/swaralink.svg`, `lp/chapterly.svg`.
6. **Trust badge:** Stripe Verified Partner (`lp/stripe.svg`).
7. **The journey (optional)** — EE's idea→plan→prototype→validate→product strip
   (`lp/idea.svg` / `lp/plan.svg` / `lp/prototype.svg` / `lp/validate.svg` / `lp/product.svg`).
8. **Contact CTA:** **"Let's build great apps together."** → `contact@emergence-engineering.com`
   + Calendly link. EE wordmark `public/ee-logo.svg`.

**Visuals:** EE wordmark, all EE service/client/tech SVGs above. This page may use EE's orange accent
since it *is* the EE brand surface.

---

## 24. `/blog` (exists) — editorial / SEO-GEO engine

**Goal.** Engineering credibility + organic discovery. Already scaffolded (`site/src/pages/blog/`).

**Suggested launch posts (match EE's proven "we solved a hard thing" register):**
- "How we ran KiCad in a browser with WebAssembly" (the asyncify/perf story)
- "Real-time multiplayer for a native C++ app: Yjs/CRDT over a WASM EDA"
- "Browser EDA isn't a toy: what actually runs in PCBJam"
- "Coming from EAGLE? Open your board in a browser tab" (migration, captures EOL search traffic)
- "Self-hosting PCBJam: your designs, your servers"

**Visuals:** per-post OG images; reuse `yjs.svg`, `prosemirror.svg`, tech logos.

---

## 25. `/thanks` (post-waitlist confirmation)

**Goal.** Confirm, reduce buyer's remorse, drive a share, and soft-pitch EE.

**Copy.**
- **H1:** **You're on the list. 🎉**
- **Body:** We'll email you the moment your early-access seat opens. In the meantime: star us on
  GitHub, read how we built it, or follow along on the roadmap.
- **Buttons:** `Star on GitHub` (`lp/github.svg`) · `How it works` · `Roadmap`
- **Share line:** *Know someone wrestling with desktop EDA? Send them pcbjam.com.*
- **EE soft-pitch (tiny footer line):** *PCBJam is built by Emergence Engineering — we build hard
  software for other teams too. `contact@emergence-engineering.com`.*

**Visuals:** celebratory but restrained; PCBJam mark; GitHub mark.

---

## 26. Legal pages (exist)

`/privacy`, `/terms`, `/cookies` already exist in `site/src/pages/`. Update entity name (Emergence
Engineering), the data handled by the waitlist (email), and any analytics/cookie disclosures. Keep
the dark, minimal layout.

---

# PART C — Execution notes

## 27. SEO / meta per page

| Page | `<title>` | Meta description (draft) |
|---|---|---|
| `/` | **PCBJam — KiCad in your browser, now multiplayer** | Open-source PCB design in your browser with real-time collaboration. Built on KiCad. No install, open format, free to start. Join the waitlist. |
| `/how-it-works` | How PCBJam works — collaborative PCB design in the browser | Watch real-time multiplayer KiCad in action: live cursors, conflict-free editing, full schematic + PCB layout, in a browser tab. |
| `/open` | Open & self-hostable PCB design — PCBJam | Your designs in open KiCad format. Self-host, work offline as a PWA, open source. Collaborate in the cloud without lock-in. |
| `/roadmap` | PCBJam roadmap & status | What works today and what's next for browser-based collaborative KiCad. Honest status, no overpromises. |
| `/built-by-emergence` | Built by Emergence Engineering — software studio | The team behind PCBJam. We build WebAssembly ports, real-time collaborative editors, AI features, and fintech. Hire us. |

Add per-page OG images (1200×630), canonical URLs, and JSON-LD (`SoftwareApplication` for `/`,
`Organization` for `/built-by-emergence`).

## 28. Performance (non-negotiable — the WASM context)

The marketing site must stay **fast and light** (current `site/` ships zero JS, no web fonts — keep
that for the marketing pages). The heavy WASM app is a *separate* surface; never let it bloat the
landing page. The demo video must be **lazy-loaded, compressed, poster-first**, and `preload="none"`.
Honor `prefers-reduced-motion` (poster instead of autoplay). Don't let "we run a huge WASM app"
become "our landing page is slow" — that would undercut the core performance pitch.

## 29. Conversion & analytics

- One dominant action sitewide: **waitlist email capture.** Secondary: GitHub star, demo view,
  consulting contact. Never put a competing primary CTA above the fold.
- Instrument: waitlist submits (by section), demo plays/completion, consulting CTA clicks, GitHub
  clicks. A/B the **hero headline** (the three options in §7) once there's traffic.
- Disclose analytics in `/cookies`.

## 30. Build mapping (Astro)

- Replace the placeholder `site/src/pages/index.astro` with §7–§19.
- New pages → `site/src/pages/how-it-works.astro`, `open.astro`, `roadmap.astro`,
  `built-by-emergence.astro`, `thanks.astro`.
- Copy chosen SVGs into `site/public/` (suggest `site/public/ee/` for EE-brand,
  `site/public/icons/` for generic, `site/public/logos/` for client/partner). Source paths are all
  under `/Users/V/IdeaProjects/blog/public/` (see §4a).
- Reusable Astro components: `WaitlistForm.astro`, `StatBar.astro`, `Pillar.astro`, `Step.astro`,
  `SectionBand.astro`, `EECredit.astro`.
- Apply the brand-guide tokens (§3) into `site/src/styles/global.css` (it already matches the dark
  palette; extend with the full scales + presence colors).

## 31. Open production checklist (what's blocking, ranked)

1. **★ Multiplayer demo video/GIF** (§4b.2) — the page cannot ship persuasively without it.
2. **PCBJam logo / wordmark / favicon** (§4b.1).
3. **Real product screenshots** ×4 (§4b.4).
4. **Hero board still w/ presence cursors** (§4b.3).
5. **Waitlist backend** — email capture endpoint + storage + confirmation (decide: HubSpot/ConvertKit/
   own). Wire `WaitlistForm`.
6. **Real numbers** for the stat bar (§8) and roadmap (§22) — pull from the repo's WHATWORKS/test docs; don't invent.
7. **External logos** with usage rights (§4b.7): KiCad (attribution per trademark policy), migration
   sources, fab partners.
8. **Positioning quadrant graphic** (§15) and **3-step diagram** (§11).
9. **Confirm contact email** (hyphenated `contact@emergence-engineering.com`) and set up PCBJam's own inbox.
10. **Verify any competitor number** (Flux pricing in §17) before publishing — point-in-time.

---

### Provenance
Synthesized from `features/lp/` (competitor teardown, verified synthesis, brand guide,
best-practices, playbook) + a full extraction of Emergence Engineering's live site source
(`blog/`, voice/services/case-studies/assets) + a direct inventory of the on-disk SVG library.
Founder decisions (name=PCBJam, waitlist, product-first+EE-credit, open+free-to-start) are locked in §0.
Point-in-time; re-verify external claims and prices before launch.
