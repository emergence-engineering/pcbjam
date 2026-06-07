# Landing-Page Research & Strategy — `features/lp/`

Competitive research and landing-page strategy for **KiCad in a web browser, with real-time collaboration**.

Generated **2026-06-07** by two automated, multi-agent web-research passes:

1. **Per-competitor teardown** — one researcher agent per competitor fetched the live homepage + pricing/feature pages and extracted structured positioning. Output rendered deterministically so no competitor is dropped. → `competitor-landing-pages.md`
2. **Adversarially-verified synthesis** — a second pass fanned out search angles, fetched ~21 primary sources, extracted ~95 claims, and put the top 25 through 3-vote adversarial verification (a claim needs 2/3 skeptic votes to be killed). → `competitive-analysis-synthesis.md` + the two angle files.

> ⚠️ **Point-in-time.** Landing pages, hero copy, and especially pricing change fast. Re-verify any price or headline before using it in a launch. Where an automated fetch hit HTTP 403 (e.g. Cadence, Fritzing), claims were corroborated via vendor sub-pages and independent sources rather than the canonical URL.

---

## Files (recommended reading order)

### Competitor research (the core ask)
| File | Size | What it is |
|---|---|---|
| **`competitor-landing-pages.md`** | ~330 KB | **PRIMARY deliverable.** Exhaustive teardown of **26 competitors** (the 21 named + Wokwi, CircuitLab, tscircuit, KiCanvas). Part I = strategic synthesis (positioning map, comparison table, gaps, recommended positioning + 3 hero headlines, 13-section LP outline, risks). Part II = verbatim per-competitor profiles (hero copy, sections, pricing, CTAs, social proof, differentiators, tone, collaboration/browser angle). 19/26 high-confidence. |
| `competitive-analysis-synthesis.md` | ~16 KB | The **verified "spine."** Only the claims that survived 3-vote adversarial verification, with citations. Tighter and higher-confidence than Part I, narrower coverage (Flux, Altium 365, OrCAD X, LibrePCB, Horizon, Fritzing, Quilter). Start here if you want the defensible core. |
| `incumbent-desktop-eda-cloud-marketing.md` | ~15 KB | Angle detail: incumbent desktop suites + their cloud add-ons (Altium, Cadence OrCAD X, Zuken, Fusion/EAGLE, DipTrace, CircuitMaker) and how they frame cloud/collaboration. |
| `competitors-ai-automation-parts.md` | ~13 KB | Angle detail: AI/automation, "Git-for-hardware," parts, and requirements players (Quilter, JITX, CELUS, AllSpice, SnapMagic, Valispace, AISLER). |

### Landing-page execution (bonus — beyond the competitor ask, but tailored to this product)
| File | Size | What it is |
|---|---|---|
| **`pcbjam-landing-page-copy-and-visuals.md`** | — | **The deliverable.** Build-ready, section-by-section copy + visuals spec for the **PCBJam** marketing site (landing + supporting pages), grounded in this folder's research, Emergence Engineering's brand/voice (`../../../blog/`), and a real on-disk SVG inventory. Locked decisions: name=**PCBJam**, **waitlist** launch, **product-first + EE consulting credit**, **open + free-to-start (no price table yet)**. Includes asset map, per-section copy, SEO, and a production checklist. |
| `brand-guide.md` | ~21 KB | Brand & design tokens for the marketing site. Grounded in the real `site/` Astro project (`site/src/styles/global.css`): color scales, typography, voice/tone, collaboration palette. |
| `landing-page-best-practices.md` | ~51 KB | General, data-backed landing-page/CRO reference (structure, copy, CTAs, forms, trust, performance, SEO, A/B testing), with claims graded verified vs. established-practice. |
| `marketing-site-playbook.md` | ~82 KB | The full marketing-surface playbook: homepage, feature/use-case/comparison/integration pages, pricing, demo, SEO/GEO/CRO, performance (the WASM problem), launch GTM, implementation checklists. (Formerly `README.md`.) |
| `astro-templates-and-component-libraries.md` | ~25 KB | **Build-tooling survey.** Exhaustive, adversarially-verified rundown of Astro landing-page templates (AstroWind, Astroship, Cruip…), Astro-native + Tailwind component libraries (daisyUI, Preline, Accessible Astro, Starwind), Tailwind Plus (paid), React-island libs (shadcn/Magic UI/Aceternity) + tradeoffs, animation, icons/fonts/code-blocks, and SEO/perf tooling — all weighed against the real `site/` Astro project. **Decision: use Tailwind** (`npx astro add tailwind` + daisyUI). Free pick: AstroWind blocks; paid pick: Tailwind Plus ($299). |

---

## The one-paragraph takeaway

Across 26 competitors, **no one occupies the intersection of browser-native full editing + true real-time multiplayer + open-source.** Flux.ai is the only head-on rival (browser + collaboration) but it is proprietary, metered per editor ($112–158/editor for Pro/Teams), and has pivoted its headline to AI ("the world's first AI hardware engineer"). Incumbents (Altium 365, OrCAD X) are desktop-authoring + browser-*review-only* ("Design on your desktop. Collaborate in the cloud."). OSS peers (LibrePCB, Horizon, Fritzing) are desktop-only with no collaboration. KiCanvas proves browser-native KiCad rendering has demand — and stops at read-only, exactly where we begin. The open lane: **"KiCad, in your browser — now multiplayer"** — real co-editing (not just viewing), on the open toolchain people already trust, no install, no lock-in.

---

## Provenance & caveats
- Fully machine-generated from live web sources on 2026-06-07; treat as a strong first draft, not ground truth. Spot-check any number you quote externally.
- The per-competitor pass (`competitor-landing-pages.md`) is broader but lower-bar; the verified synthesis is narrower but adversarially checked. They agree on every major conclusion.
- One claim was refuted 0-3 and excluded: that OrCAD X's *core* positioning is cloud-first. It is desktop-first with a cloud review layer.
