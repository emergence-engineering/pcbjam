# Landing Page Best Practices — An Exhaustive Reference

> A practical, data-backed guide to designing high-converting landing pages for
> marketing, product, and SaaS sites. Covers conversion optimization, page
> structure, copy, CTAs, forms, trust, visual design, typography, performance,
> mobile, accessibility, SEO, experimentation, personalization, and anti-patterns.

## How to read this document

Claims in this doc come in two tiers. Treat them differently:

- **🟢 Verified** — backed by a primary or strongly-corroborated source, and
  adversarially fact-checked (see [Sources](#sources--evidence-grade) and
  [Caveats](#caveats-source-quality--things-that-got-refuted)). Statistics are
  cited inline like `[U24]`.
- **⚪ Established practice** — broad professional consensus from UX/CRO
  literature (NN/g, Baymard, CXL, Smashing Magazine) but not individually
  fact-checked with a hard statistic here. Reliable as guidance; verify the
  exact number before quoting it externally.

When a figure is a **vendor benchmark** or **dated**, the doc says so. Two
widely-repeated stats were checked and **failed verification** — they are listed
in [Caveats](#caveats-source-quality--things-that-got-refuted) so you don't repeat
them.

> The single most important meta-principle: **none of these are laws.** They are
> strong priors. The only authority on *your* page is *your* A/B test with *your*
> traffic. Use this doc to generate better hypotheses, not to skip testing.

---

## Table of contents

1. [Executive summary & checklist](#1-executive-summary--checklist)
2. [Conversion rate optimization: principles & benchmarks](#2-conversion-rate-optimization-principles--benchmarks)
3. [Page structure & the canonical sections](#3-page-structure--the-canonical-sections)
4. [Copywriting & messaging frameworks](#4-copywriting--messaging-frameworks)
5. [Call-to-action (CTA) design](#5-call-to-action-cta-design)
6. [Forms & lead capture](#6-forms--lead-capture)
7. [Trust signals & credibility](#7-trust-signals--credibility)
8. [Visual design: layout, hierarchy, color, imagery, video](#8-visual-design-layout-hierarchy-color-imagery-video)
9. [Typography](#9-typography)
10. [Performance & Core Web Vitals](#10-performance--core-web-vitals)
11. [Mobile-first & responsive design](#11-mobile-first--responsive-design)
12. [Accessibility (WCAG)](#12-accessibility-wcag)
13. [SEO for landing pages](#13-seo-for-landing-pages)
14. [A/B testing, experimentation & analytics](#14-ab-testing-experimentation--analytics)
15. [Personalization & message-to-ad match](#15-personalization--message-to-ad-match)
16. [Common mistakes & anti-patterns](#16-common-mistakes--anti-patterns)
17. [Pre-launch QA checklist](#17-pre-launch-qa-checklist)
18. [Sources & evidence grade](#sources--evidence-grade)
19. [Caveats, source quality & refuted claims](#caveats-source-quality--things-that-got-refuted)

---

## 1. Executive summary & checklist

A high-converting landing page does five things well, in priority order:

1. **Communicates one clear value proposition** matched to the visitor's intent,
   above the fold, in scannable language.
2. **Reduces friction** — one primary goal, one (or few) CTA, minimal form fields,
   fast load.
3. **Builds trust** — social proof, specifics, credible design, guarantees.
4. **Loads fast and works everywhere** — Core Web Vitals in the green, mobile-first,
   accessible.
5. **Gets measured and iterated** — instrumented analytics, disciplined A/B tests.

### The one-screen checklist

- [ ] **One page, one goal.** Single conversion action; minimize or remove site nav.
- [ ] **Headline states the value prop** and matches the ad/email that sent the visitor (message match).
- [ ] **Above-the-fold answers**: What is this? What's in it for me? What do I do next?
- [ ] **Primary CTA** is visually dominant, specific ("Start my free trial," not "Submit"), repeated down the page.
- [ ] **Copy is scannable** — short paragraphs, subheads and bullets that lead with information-carrying words, ~5th–7th grade reading level. 🟢`[U24]`
- [ ] **Social proof near the CTA** — testimonials, logos, counts, ratings, named sources.
- [ ] **Form asks only for what you need** now; consider multi-step for longer forms.
- [ ] **Benefits before features**; show, don't just tell (screenshots, demo, video).
- [ ] **LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1** at the 75th percentile. 🟢`[WV]`
- [ ] **Hero/LCP image is eagerly loaded** (never `loading="lazy"`); everything below the fold lazy-loaded. 🟢`[WV]`
- [ ] **Mobile-first**: tap targets ≥ ~44px, readable without zoom, no horizontal scroll.
- [ ] **Contrast**: ≥ 4.5:1 body text, ≥ 3:1 large text & UI component borders (WCAG 2.1 AA). 🟢`[W3C]`
- [ ] **Analytics + a single primary metric** defined before launch; experiments sized and not "peeked." 🟢`[GB]`

---

## 2. Conversion rate optimization: principles & benchmarks

### 2.1 What counts as a "good" conversion rate

> ⚠️ **Source caveat for this whole subsection.** All numbers below come from
> Unbounce's **2024 Conversion Benchmark Report** `[U24]` — 41,000 landing pages,
> 57M+ conversions, 464M pageviews. It is the most-cited public dataset, but it
> measures **pages built on Unbounce's own platform** using **median** methodology.
> Treat these as **directional benchmarks, not universal population statistics.**

- 🟢 **Median landing-page conversion rate across all industries: 6.6%.** `[U24]`
- 🟢 **A "good" rate (75th percentile) starts around 11.4%** and ranges up to
  **40.8%** depending on industry. `[U24]` Don't conflate this with the median —
  most pages sit far below it.
- 🟢 **Industry medians range from 3.8% (SaaS, the lowest) to 12.3%
  (entertainment/events, the highest).** `[U24]` **SaaS is ~42% below the 6.6%
  baseline** — a SaaS page converting at 4% is roughly average, not broken.

**Takeaway:** Benchmark against *your industry and traffic source*, and against
*your own past performance*, not against a global average. The most useful number
is your trend line, not the percentile table.

### 2.2 Traffic source dominates the result

🟢 Conversion varies enormously by **audience intent**, not just page quality `[U24]`:

| Channel       | Avg. conversion | Notes |
|---------------|-----------------|-------|
| **Email**     | **19.3%**       | Highest — warm, opted-in, pre-qualified audience |
| Paid social   | ~12%            | |
| Paid search   | ~10.9%          | |
| Display       | ~4.1%           | Coldest, lowest-intent traffic |

Email converts ~60% better than paid social, ~77% better than paid search, and
~370% better than display. `[U24]`

> **Critical interpretation:** This is an **audience-temperature artifact**, not
> proof that one channel is "better." Email visitors already know you. **Never
> benchmark a cold paid-traffic landing page against an email landing page** — judge
> each page against the typical conversion rate *for its own channel.*

### 2.3 Simpler copy correlates with higher conversion

🟢 There is a **strong correlation between reading ease and conversion** `[U24]`:

| Reading level         | Conversion rate |
|-----------------------|-----------------|
| 5th–7th grade         | **11.1%**       |
| 8th–9th grade         | 7.1% (~56% lower) |
| Professional/college  | 5.3% (~2× lower) |

**Caveats:** This is **correlation, not causation**, on a single-vendor dataset,
and there is at least one documented industry exception (entertainment, where
higher-grade copy converts better). Still, "write simpler" is one of the
safest, highest-leverage moves in CRO.

> ⛔ Do **not** cite the related "514% better / 12.9% vs 2.1% for SaaS" figure — it
> **failed verification.** See [Caveats](#caveats-source-quality--things-that-got-refuted).

### 2.4 Core CRO mental models (⚪ established practice)

- **Conversion = Motivation − Friction − Anxiety (+ Incentive).** Increase
  motivation (value, relevance), strip friction (steps, fields, load time, choices),
  and reduce anxiety (risk, trust). This is the operational heart of CRO.
- **One page, one goal.** Every element either advances the single conversion
  goal or is a candidate for deletion. Competing CTAs dilute results.
- **Attention/decision ratio.** A focused landing page ideally has a 1:1 ratio of
  links to conversion goals — remove site nav, footers full of links, and
  secondary offers that leak attention.
- **Friction audit beats feature addition.** Most conversion gains come from
  *removing* obstacles (a field, a step, a second of load) rather than adding
  persuasion.
- **The page is a continuation of the click.** The visitor arrived with an
  expectation set by the ad/email/search result. Honor it (see
  [Message match](#15-personalization--message-to-ad-match)).

---

## 3. Page structure & the canonical sections

Landing pages follow a well-worn vertical narrative. Not every page needs every
section, but this is the canonical order and purpose. (⚪ established practice
throughout, with the scanning/hierarchy points 🟢 verified.)

### 3.1 The above-the-fold / hero

The first screen must answer three questions in **~5 seconds**:

1. **What is this?** (Headline — the value proposition)
2. **What's in it for me?** (Subhead — the benefit / how it helps)
3. **What do I do next?** (Primary CTA)

Components:
- **Headline** — clear over clever. State the outcome the visitor wants. Match the
  source ad/email wording.
- **Subheadline** — one or two lines expanding the promise or naming the mechanism.
- **Primary CTA** — visually dominant button (see §5).
- **Hero visual** — product screenshot, short demo, or a human/contextual image
  that reinforces (not decorates) the message. This is usually your **LCP element**
  — load it eagerly (§10).
- **Optional**: a one-line trust strip (logo bar, rating, "trusted by N teams").

🟢 **Why the fold still matters:** users **scan, they don't read**, in an
**F-shaped pattern** — a horizontal sweep across the top, a shorter sweep lower,
then a vertical scan down the left edge. **Exhaustive word-by-word reading is
rare**, so the **most important information must be in the first two paragraphs**,
and the page must front-load meaning. `[NNf]`

### 3.2 Value proposition / problem framing

Immediately below the hero, expand on *why this matters*: the problem you solve and
the transformation you offer. Frameworks like PAS and AIDA (see §4) live here.

### 3.3 Social proof

Place social proof **early and again near each CTA**. Forms include:
- Customer **logos** ("trusted by")
- **Testimonials** with name, role, company, and photo (specificity = credibility)
- **Ratings/reviews** (stars, G2/Capterra/Trustpilot badges)
- **Quantified outcomes** ("cut onboarding time 40%")
- **Usage counts** ("Join 50,000+ teams")

(See §7 for what makes proof actually credible.)

### 3.4 Features vs. benefits

Lead with **benefits** (what the user gains), support with **features** (how it's
delivered). The reliable pattern is **benefit headline → feature detail → proof**.
Pair each with a visual that *shows* it working. **Show, don't just tell.**

### 3.5 How it works

For products with any complexity, a **3-step "how it works"** removes uncertainty
and reduces anxiety. Keep it to 3–4 steps, each one verb-led and visual.

### 3.6 Pricing (when present)

⚪ Established practice:
- Show pricing if you can; hiding it adds friction and distrust for many buyers.
- **3-tier "good/better/best"** layouts work; visually highlight the recommended
  plan (anchoring).
- State billing terms plainly; show annual savings if offered.
- Put a risk-reducer next to price (free trial, money-back guarantee, "no credit
  card required").
- Reduce choice overload — too many tiers/toggles increase decision friction.

### 3.7 FAQ / objection handling

An FAQ is **objection handling in disguise.** List the real reasons people *don't*
convert (price, security, switching cost, contract terms, integrations) and answer
them. Use an accessible accordion (keyboard-operable, proper ARIA) — but ensure the
content is also crawlable for SEO.

### 3.8 Final CTA / closing section

End with a restated value proposition and a **repeated primary CTA**. A visitor who
scrolled to the bottom is engaged — don't make them scroll back up to convert.

### 3.9 Footer

For a focused landing page, keep the footer **minimal**: legal links, privacy,
contact, essential trust marks. Avoid a sprawling sitemap footer that re-introduces
the navigation you deliberately removed.

### 3.10 Navigation: usually remove it

⚪ A dedicated campaign landing page typically **removes or minimizes top
navigation** to keep the attention ratio focused on the single goal. (A page that
also serves SEO/organic discovery may keep light nav — judge by purpose. Test it.)

---

## 4. Copywriting & messaging frameworks

Copy is the highest-leverage, lowest-cost lever on most landing pages. (⚪
established practice; the **clarity/readability** and **scanning** points are 🟢.)

### 4.1 Write for scanners

🟢 Because users scan in an F-pattern and rarely read word-by-word `[NNf]`:
- **Front-load** every subhead, paragraph, and bullet with **information-carrying
  words** — the meaning must survive a left-edge vertical scan.
- Put the **most important information in the first two paragraphs.**
- Short paragraphs (1–3 lines), generous subheads, bulleted lists.
- One idea per sentence; cut filler, hedges, and throat-clearing intros.

🟢 **Keep it simple** — aim for a ~**5th–7th grade reading level**; simpler copy
correlates with materially higher conversion. `[U24]`

### 4.2 Messaging frameworks (⚪)

- **PAS — Problem · Agitate · Solution.** Name the pain, deepen it, then present
  your product as the resolution. Excellent for the section just below the hero.
- **AIDA — Attention · Interest · Desire · Action.** A whole-page arc: hook →
  build relevance → create want → ask for the action.
- **FAB — Features · Advantages · Benefits.** Translate every feature into a
  concrete user benefit. ("256-bit encryption" → "your data stays private.")
- **The 4 U's for headlines** — Useful, Urgent, Unique, Ultra-specific.
- **Jobs-to-be-done framing.** Speak to the outcome the user "hires" the product
  for, not the product's internals.

### 4.3 Message match (🟢 principle, see §15)

The headline and hero copy must **echo the ad, email, or search query** that drove
the click. Mismatch between the promise and the page is a top cause of bounce and a
direct waste of ad spend. CXL's "maintaining scent" guidance: keep the visual and
verbal "scent" continuous from ad → page → conversion. `[CXLs]`

### 4.4 Copy craft checklist

- **Specificity beats adjectives.** "Setup in 4 minutes" > "incredibly fast setup."
- **Second person.** "You/your," not "users/customers."
- **Quantify** wherever honest (numbers, %, time saved, $ saved).
- **One value proposition**, restated — don't make readers assemble it.
- **Active voice, concrete verbs.**
- **Cut jargon** unless your audience genuinely speaks it.
- **Microcopy matters** — button labels, form helper text, error messages, and the
  reassurance line under the CTA ("No credit card required") all move conversion.

---

## 5. Call-to-action (CTA) design

### 5.1 CTA copy: be specific, set accurate expectations

🟢 **Generic CTAs like "Get Started" are ambiguous and can mislead.** NN/g's
usability study found "Get Started" "can apply to almost any goal"; information-
seekers who clicked it "expected details about the company, but instead were forced
into surveys, onboarding flows, and sales funnels," became "lost, uninformed, and
frustrated," and left for competitors. NN/g's guidance: **increase information
scent by stating precisely what the user should expect.** `[NNg]`

- ✅ "Take the 2-minute style quiz," "Start my free 14-day trial," "Get the pricing
  PDF," "Book a demo."
- ⚠️ "Get Started," "Submit," "Continue," "Learn more" — vague; the user can't tell
  what happens next.

> **Nuance:** Some CRO tests show "Get Started" *winning on raw click rate.* Clicks
> aren't conversions. A vague CTA can buy a click and lose the trust — optimize for
> the *qualified* action, and write CTAs that set honest expectations. `[NNg]`

- Phrase as **first-person value** when testing ("Start **my** free trial").
- Lead with a **verb**; name the **outcome**, not the mechanics ("Submit").
- Reduce anxiety with **adjacent microcopy** ("Free forever," "Cancel anytime,"
  "No credit card required").

### 5.2 CTA visual design (⚪)

- **Make it the most visually dominant element** in its section — 🟢 hierarchy is
  driven primarily by **color/contrast and size** `[NNv]`. Use a high-contrast,
  unused accent color (the classic "make the button a color nothing else on the
  page uses").
- **Button affordance** — it should look clickable (solid fill, padding, sometimes
  subtle depth). 🟢 Its boundary must meet **3:1 contrast** for accessibility
  `[W3C]`.
- **Size & tap target** — comfortably large; ≥ ~44×44px on touch.
- **Whitespace** around the button isolates and emphasizes it.

### 5.3 Placement & quantity (⚪)

- **One primary action.** You may have a secondary, visually subordinate option
  (e.g., "Book a demo" ghost button next to "Start free trial"), but never two
  equal CTAs competing.
- **Repeat the same primary CTA** down the page (hero, after key sections, final
  close) so the visitor can act whenever convinced — but keep the *action* singular.
- **Above the fold** for low-consideration offers; for complex/expensive products,
  it's fine (and often better) for the *decision* to come after the page has made
  its case — just keep a persistent or repeated CTA available.

---

## 6. Forms & lead capture

Forms are where intent turns into conversion — and where friction kills it. (⚪
established practice; treat specific field-count numbers as directional.)

### 6.1 Ask for less

- **Every field costs conversions.** Request only what you genuinely need *at this
  step.* Defer the rest to later in the funnel or progressive profiling.
- **Typical guidance:** lead-gen forms convert best in the **~3–5 field** range;
  each extra field adds friction. (Exact optimal count is offer- and audience-
  dependent — test it.)
- **Drop optional fields** or mark them clearly. Phone number, company size, and
  "how did you hear about us" are common conversion-killers — collect them later.

### 6.2 Reduce friction in the fields you keep (⚪, drawn from Baymard-style UX research)

- **Single-column layout.** Multi-column forms cause misreads and skips.
- **Top-aligned labels** for fastest completion; keep labels visible (don't rely on
  disappearing placeholders as labels — an accessibility and usability failure).
- **Right input types & autocomplete** — `type="email"`, `inputmode`, `autocomplete`
  tokens trigger correct mobile keyboards and autofill.
- **Inline, specific validation** — validate on blur, explain *how to fix* the error,
  show errors adjacent to the field, and never wipe the form on submit failure.
- **Don't split fields unnecessarily** (e.g., one full-name field beats first/last;
  one phone field beats three).
- **Smart defaults & formatting** — auto-format phone/card numbers; default the
  obvious choice.
- **Make the submit button descriptive** (§5.1), not "Submit."

### 6.3 Multi-step forms

- **Break long forms into steps** to lower perceived effort; show a **progress
  indicator.** Each step feels small, and partial-completion creates commitment
  (sunk-cost / consistency).
- **Ask the easy/low-risk questions first** (the foot-in-the-door), sensitive ones
  (payment, phone) last.
- **Front-load momentum**: a first step that's a simple choice (radio buttons) often
  outperforms one that opens with an email field.

### 6.4 Anxiety reducers around the form

- Reassurance microcopy ("We'll never share your email," "30-second signup").
- Security/privacy cues near sensitive fields (§7).
- Clear statement of what happens after submit (and *when*).

---

## 7. Trust signals & credibility

Trust closes the gap between "interested" and "converted." Anxiety is a primary
conversion blocker; credible signals remove it. (⚪ established practice.)

### 7.1 Types of trust signals

- **Social proof** — testimonials (with real name, role, company, **photo**), case
  studies, customer logos, star ratings, third-party review badges (G2, Trustpilot,
  Capterra), and usage counts ("50,000+ teams").
- **Authority** — press mentions ("as seen in"), awards, certifications, notable
  customers, expert endorsements.
- **Security & privacy** — SSL/HTTPS (table stakes), trust seals (Norton/McAfee-style),
  PCI/SOC 2/ISO badges, GDPR/privacy statements, payment-method logos near checkout.
- **Risk reversal** — money-back guarantee, free trial, "no credit card required,"
  free cancellation, free returns. These directly attack purchase anxiety.
- **Transparency** — real company info, a physical address, named team, working
  contact methods, clear pricing.

### 7.2 What makes proof *credible* (not just present)

- **Specific beats generic.** "Reduced support tickets 38% in 60 days — Maria K.,
  Head of CX at Acme" outperforms "Great product! — A customer."
- **Faces and names** raise believability; anonymous quotes read as fabricated.
- **Relevance/recognizability** — logos and testimonials from companies *like the
  visitor's* matter more than famous-but-irrelevant ones.
- **Proximity to the decision** — put proof and risk-reversers **right next to the
  CTA/form**, where doubt peaks.
- **Don't over-badge.** A wall of generic seals can *reduce* trust (looks spammy);
  a few relevant, credible marks beat many weak ones.

---

## 8. Visual design: layout, hierarchy, color, imagery, video

### 8.1 Visual hierarchy

🟢 **Visual hierarchy guides the eye to the most important elements**, and
importance is communicated **primarily through color (and contrast) and size/scale**,
while **proximity and grouping (common regions)** show which elements belong
together. `[NNv]`

> *Calibration note:* this was the one finding in the research with a non-unanimous
> verification (2–1); NN/g's broader writing lists scale, value, color, spacing,
> placement "and a variety of other signals." Color and size are the two **most-
> emphasized** cues, but they aren't the *only* ones. `[NNv]`

Apply it:
- The **primary CTA** should be the highest-contrast, attention-grabbing element in
  its viewport.
- A clear **type scale** (§9) makes headline > subhead > body obvious at a glance.
- **Group related items** (label with its field, benefit with its icon) via
  proximity; separate unrelated ones with whitespace.

### 8.2 Layout & scanning patterns

🟢 Design for **F-pattern scanning** on text-heavy pages: front-load meaning,
left-align key content, use subheads as scan anchors. `[NNf]`

⚪ The **Z-pattern** suits sparse, hero-style layouts (logo top-left → CTA
top-right → diagonal → bottom CTA). Use Z for minimal hero sections, F for
content-dense pages.

⚪ **Whitespace** (negative space) is an active design tool: it increases
comprehension, reduces cognitive load, isolates the CTA, and signals quality.
Don't fear emptiness around the key action.

⚪ **Directional cues** — arrows, a person's gaze, lines, motion — can guide
attention toward the CTA/form. (Eye-tracking shows people tend to look where a
pictured face looks.)

### 8.3 Color & contrast

- ⚪ Use a **restrained palette**: a neutral base, one brand color, and a single
  **high-contrast accent reserved for CTAs.** Color's job here is hierarchy, not
  decoration — don't dilute the accent by using it everywhere.
- 🟢 **Meet contrast minimums**: ≥ **4.5:1** for body text, ≥ **3:1** for large text
  and **UI component borders** (WCAG 2.1 AA — §12). `[W3C]`
- ⚪ Don't rely on **color alone** to convey meaning (errors, required fields,
  states) — pair with text/icons for colorblind users.
- ⚪ "Which button color converts best" is **context-dependent** — the winning color
  is whatever **contrasts most** with its surroundings and the rest of the palette,
  not a universally magic hue. Test it.

### 8.4 Imagery vs. illustration

- ⚪ **Show the actual product** (real screenshots, UI, the thing in use) — it
  outperforms generic stock imagery and decorative abstractions for most products.
- ⚪ **Avoid clichéd stock photos** (handshakes, faceless "business people"); they
  read as filler and can lower trust.
- ⚪ **Images must reinforce the message**, not just fill space — a "hero image" that
  says nothing about the offer is wasted real estate (and often the LCP cost).
- ⚪ **Human faces** can increase warmth and direct attention, but choose authentic,
  relevant imagery over staged stock.
- **Performance:** the hero image is usually the **LCP element** — optimize and
  **eagerly load** it (§10).

### 8.5 Video

- ⚪ A short **explainer/demo video** can lift conversion for products that benefit
  from showing motion or workflow — but it adds weight and can distract.
- **Never autoplay with sound.** Make controls obvious. Provide **captions**
  (accessibility + sound-off viewing).
- **Don't let video block the LCP/critical render** — use a lightweight poster
  image, lazy-load the player, and avoid heavy embeds above the fold.
- **Provide a text/visual fallback** — many users won't press play; the page must
  still convert without the video.

---

## 9. Typography

Type is most of what a landing page *is* — it carries the message and a large share
of perceived quality. (⚪ established practice; web-font performance ties to the 🟢
Core Web Vitals section.)

### 9.1 Readability fundamentals

- **Body size:** ~16px minimum on the web; larger (18–20px) is increasingly common
  and improves readability. Never ship sub-14px body copy.
- **Line length (measure):** aim for **~50–75 characters per line** (~45–75). Too
  long tires the eye; too short breaks rhythm.
- **Line height (leading):** roughly **1.4–1.6×** the font size for body text.
- **Sufficient contrast** (§8.3 / §12) — light-gray-on-white body text is a common,
  avoidable readability and accessibility failure.
- **Left-aligned body text** for LTR languages; avoid justified text on the web
  (uneven spacing/rivers). Don't center long paragraphs.

### 9.2 Type scale & hierarchy

- Use a **modular scale** (e.g., 1.2–1.333 ratio) so headline, subhead, body, and
  caption sizes relate harmoniously and the hierarchy reads instantly.
- Establish **2–3 clear levels** of heading plus body and small/caption. Differ by
  **size and weight**, not many different fonts.
- Hierarchy via **weight and size**, sparingly via color — ties back to 🟢 visual
  hierarchy being driven by size and color `[NNv]`.

### 9.3 Font pairing (⚪, Smashing Magazine)

- **Limit to two typefaces** (often one display/heading + one body), occasionally
  three. More than that looks chaotic and hurts performance.
- **Pair by contrast, not similarity** — combine fonts that are clearly different
  (e.g., a characterful serif heading with a clean sans body) so each has a job;
  near-identical fonts create awkward tension. `[SMt]`
- **A single well-chosen superfamily** (with multiple weights/styles) can do the
  whole job and guarantees harmony. `[SMt]`
- Match **mood and x-height**; ensure both fonts have the weights you need.

### 9.4 System fonts vs. custom web fonts (performance trade-off)

- **System font stacks** (e.g., `-apple-system, Segoe UI, Roboto, …`) have **zero
  network cost, no FOIT/FOUT, and instant render** — the fastest possible choice and
  great for LCP/CLS. The trade-off is less brand distinctiveness.
- **Custom web fonts** strengthen brand but add bytes and a render dependency that
  can hurt **LCP** (text paint) and cause **CLS** (layout shift on swap). If you use
  them:
  - **Subset** to the characters/weights you actually use.
  - Use **`woff2`** (smallest modern format).
  - **`font-display: swap`** (or `optional`) to avoid invisible text (FOIT); `swap`
    favors content visibility, `optional` favors stability.
  - **`<link rel="preload">`** the critical (above-the-fold) font files.
  - **Self-host** where feasible (avoids a third-party connection; third-party font
    CDNs add a connection and are no longer cache-shared across sites).
  - **Set `size-adjust`/`@font-face` metric overrides or a matched fallback** to
    minimize the layout shift when the web font swaps in (protects **CLS**).
- **Pragmatic default:** system fonts (or one preloaded, subset display font for
  headings + a system body) gives most of the brand benefit at a fraction of the
  performance cost.

---

## 10. Performance & Core Web Vitals

Speed is a conversion feature, an SEO factor, and a UX baseline. (🟢 thresholds and
lazy-loading are primary-sourced from Google.)

### 10.1 The Core Web Vitals thresholds

🟢 Google's Core Web Vitals define the bar for a good experience, measured at the
**75th percentile** of page loads `[WV]`:

| Metric | Measures | Good | Needs improvement | Poor |
|--------|----------|------|-------------------|------|
| **LCP** (Largest Contentful Paint) | Loading | **≤ 2.5s** | 2.5–4s | > 4s |
| **INP** (Interaction to Next Paint) | Interactivity | **≤ 200ms** | 200–500ms | > 500ms |
| **CLS** (Cumulative Layout Shift) | Visual stability | **≤ 0.1** | 0.1–0.25 | > 0.25 |

🟢 **INP replaced First Input Delay (FID)** as a stable Core Web Vital in **March
2024.** `[WV]`

### 10.2 Optimizing each metric (⚪ tactics, 🟢 the lazy-load rule)

**LCP (loading)** — usually the hero image or headline text:
- 🟢 **Never lazy-load the LCP/above-the-fold image.** Lazy-loading it opts it out of
  the preload scanner and de-prioritizes it, hurting LCP. **Eagerly load in-viewport
  images; lazy-load everything below the fold** — fewer bytes *and* better CWV. In
  Google's A/B tests, disabling lazy-load on the hero improved LCP ~13% desktop /
  ~15% mobile. Best result pairs eager loading with **`fetchpriority="high"`.** `[WV]`
- Serve responsive, modern-format images (AVIF/WebP), correctly sized; compress.
- **Preload** the LCP image/font; inline critical CSS; minimize render-blocking JS/CSS.
- Use a CDN; enable caching; reduce server response time (TTFB).

**INP (interactivity):**
- Ship **less JavaScript**; code-split and defer non-critical scripts.
- Break up **long tasks**; avoid heavy work on the main thread during interactions.
- Audit third-party scripts (tag managers, chat widgets, A/B-test tools) — they're a
  top INP and weight offender.

**CLS (visual stability):**
- **Always set explicit `width`/`height` (or `aspect-ratio`)** on images, videos,
  iframes, and ad slots so space is reserved.
- **Reserve space** for late-loading content (banners, embeds, cookie bars).
- Avoid inserting content **above** existing content after load.
- Prevent **font-swap shift** (see §9.4 — `size-adjust`/metric overrides).

### 10.3 Speed and conversion

🟢 **Mobile speed is conversion-critical** `[GMS]`:
- **53% of mobile visits are abandoned if a site takes longer than 3 seconds to
  load.**
- **Bounce rate climbs steeply with load time** — ~**13%** for pages under 3s, rising
  to nearly **60%** by 9s.

> ⚠️ **Caveats:** these figures are from Google research dated **~2016–2017** (≈9–10
> years old) and describe **correlation**, not proven causation. They are still
> widely cited and directionally sound — faster is better — but don't present them as
> fresh or causal. ⛔ The related "**1 second faster → up to 27% more conversions**"
> claim **failed verification** — do not cite it (see
> [Caveats](#caveats-source-quality--things-that-got-refuted)).

### 10.4 Performance checklist

- [ ] Measure with **field data** (CrUX / real-user monitoring), not just lab tools.
- [ ] LCP element identified, optimized, **eagerly loaded + preloaded.** 🟢
- [ ] Images: responsive, modern format, compressed, dimensioned.
- [ ] Below-fold media `loading="lazy"`. 🟢
- [ ] Fonts subset, `woff2`, preloaded, `font-display: swap`. (§9.4)
- [ ] JS minimized, deferred, third-parties audited.
- [ ] CLS guarded with reserved space everywhere.
- [ ] Tested on a **real mid-tier phone on throttled network**, not just desktop.

---

## 11. Mobile-first & responsive design

The majority of landing-page traffic is mobile; design for the small screen first,
then enhance. (⚪ established practice; speed and accessibility points are 🟢.)

- **Design mobile-first.** Decide what matters on a 360–390px-wide screen, then add
  for larger viewports. Don't shrink a desktop page as an afterthought.
- **Single-column, thumb-friendly layouts.** Stack content; keep the primary CTA
  reachable and prominent (consider a persistent/sticky CTA on long pages).
- **Tap targets ≥ ~44×44px** with adequate spacing so users don't mis-tap.
- **Readable without zoom** — ≥16px body, sufficient contrast, no horizontal scroll.
- **Compress the above-the-fold** — mobile folds are short; get value prop + CTA into
  the first screen.
- **Right input types & autofill** on forms (§6.2) — mobile typing is costly.
- **Mind fat-finger zones** and avoid hover-dependent interactions (no hover on
  touch).
- 🟢 **Mobile performance is non-negotiable** — see the 53%/bounce-curve data (§10.3)
  `[GMS]`. Mobile users are on worse networks and devices; budget accordingly.
- **Responsive ≠ accessible automatically**, but they overlap: fluid layouts,
  scalable text (respect user zoom up to 200%), and reflow without loss of content
  serve both. `[LA]`
- **Test on real devices** across iOS/Android and a range of widths, not just the
  browser emulator.

---

## 12. Accessibility (WCAG)

Accessibility widens your audience, reduces legal risk, and overlaps heavily with
good UX and SEO. Target **WCAG 2.1 (or 2.2) Level AA.** (🟢 contrast is primary-
sourced from W3C; the rest is established WCAG guidance.)

### 12.1 Contrast (🟢 verified)

WCAG 2.1 AA minimums `[W3C]`:
- **Body/normal text & images of text: ≥ 4.5:1** (SC 1.4.3).
- **Large text** (≥18pt, or ≥14pt bold): **≥ 3:1.**
- **Non-text UI components & graphics** — button boundaries, form-field borders,
  icons that convey meaning, focus indicators: **≥ 3:1** (SC 1.4.11 Non-text
  Contrast).

(The stricter 7:1 / 4.5:1 thresholds are **AAA**, optional.)

### 12.2 Other essentials (⚪ WCAG AA)

- **Semantic structure** — real `<h1>…<h6>` order, landmarks (`header/main/nav/
  footer`), lists, and a single descriptive `<h1>` (also helps SEO).
- **Keyboard operable** — every interactive element reachable and usable by keyboard,
  in a logical order, with a **visible focus indicator.**
- **Alt text** — meaningful images get descriptive `alt`; decorative images get
  empty `alt=""`.
- **Labels** — every form field has a programmatically associated, persistent
  `<label>`; errors are announced and described in text (not color alone).
- **Don't convey meaning by color alone** (§8.3).
- **Respect `prefers-reduced-motion`**; avoid content that flashes > 3×/sec.
- **Captions/transcripts** for video/audio.
- **Resizable text / zoom** to 200% without loss of content or function.
- **Accessible accordions/modals/tabs** (FAQ, menus) — correct ARIA, focus
  management, escape handling.
- **Test** with automated tools (axe, Lighthouse, WAVE) *and* manual keyboard +
  screen-reader passes; automation catches only a fraction of issues.

---

## 13. SEO for landing pages

Even paid/campaign pages benefit from SEO hygiene; organic landing pages depend on
it. (⚪ established practice; overlaps with 🟢 performance & accessibility.)

- **Search intent match** — the page must satisfy the query it targets; align
  headline and content to intent.
- **One primary keyword/topic per page**, in the **`<title>`**, `<h1>`, an early
  paragraph, and naturally throughout — no stuffing.
- **Unique, compelling `<title>` (~50–60 chars)** and **meta description (~150–160
  chars)** — they drive click-through from the SERP.
- **One `<h1>`**, logical heading hierarchy (also accessibility, §12).
- **Descriptive, readable URL** with the keyword; avoid parameter soup.
- **Crawlable content** — important copy in HTML text, not baked into images;
  FAQ/accordion content present in the DOM.
- **Internal links & canonical tag** — set `rel="canonical"`, especially when paid
  variants risk duplicate-content issues.
- **Structured data** (FAQ, Product, Review, Breadcrumb schema) for rich results
  where appropriate.
- **Core Web Vitals** are a ranking signal — §10 does double duty. 🟢`[WV]`
- **Mobile-friendliness** (mobile-first indexing) — §11.
- **Image SEO** — descriptive filenames + alt text; compressed (also CWV).
- **Avoid thin/duplicate content** across many near-identical paid landing pages; if
  they shouldn't rank, consider `noindex` and rely on canonical/intent for the rest.

---

## 14. A/B testing, experimentation & analytics

Optimization without measurement is decoration. But naïve testing produces
confident, wrong answers — rigor matters. (🟢 statistical pitfalls are primary-
sourced.)

### 14.1 Instrument before you optimize (⚪)

- Define **one primary conversion metric** (the macro-conversion) **before launch**;
  track micro-conversions (scroll depth, CTA clicks, form starts/abandons) as
  diagnostics.
- Use analytics + **session recordings / heatmaps** to *find* problems, then **A/B
  testing** to *validate* fixes. Qualitative tools generate hypotheses; experiments
  confirm them.
- Watch the **whole funnel**, not just the landing page — a page "win" that lowers
  downstream quality is a loss.

### 14.2 Run experiments that don't lie to you (🟢)

- 🟢 **The multiple-comparisons problem.** Testing one hypothesis at the 5%
  significance level across **20 metrics gives ~64% probability of at least one false
  positive by chance alone** (1 − 0.95²⁰ = 0.6415). Pick a **primary metric**; apply
  a **correction** (e.g., Bonferroni) when you must judge many. `[GB]`
- 🟢 **Don't "peek."** Repeatedly checking results and stopping when you see
  significance **inflates the false-positive rate — the more you peek, the worse it
  gets.** Evan Miller's canonical example: a nominal 1% test can hit ~5%+ actual
  false-positive rate after ten peeks; worst-case ~26% vs a nominal 5%. Use a
  **fixed sample size set in advance**, or a proper **sequential testing** method
  designed for continuous monitoring. `[GB][EM]`

### 14.3 Methodology checklist (⚪ + 🟢)

- [ ] **Form a hypothesis** ("Changing X will improve Y because Z"), not a random
      tweak.
- [ ] **Calculate sample size & duration up front** from baseline rate, minimum
      detectable effect, and power (usually 80%). 🟢 (avoids peeking)
- [ ] **Run full business cycles** (≥1–2 weeks; cover weekday/weekend) to avoid
      day-of-week and novelty effects.
- [ ] **One primary metric**; secondary metrics are directional only. 🟢
- [ ] **Don't stop early** on a "significant" result; respect the predetermined
      endpoint. 🟢
- [ ] **Ensure adequate traffic** — low-traffic pages can't power reliable tests;
      prioritize bigger changes or longer runs.
- [ ] **Test meaningful changes** (value prop, offer, layout) over trivial ones
      (button shade) when traffic is scarce — bigger effects need less traffic.
- [ ] **Segment** results (device, source, new vs returning) — an aggregate tie can
      hide a strong segment win/loss.
- [ ] **Account for guardrail metrics** (revenue quality, churn, support load), not
      just the click.

### 14.4 "Best practices" are hypotheses, not guarantees (⚪)

Every recommendation in this document is a **prior**, not a verdict. CXL's point
stands: copied "best practices" frequently fail because they ignore *your* context,
audience, and traffic. `[CXLf]` Use this doc to *generate* tests; let *your* data
decide.

---

## 15. Personalization & message-to-ad match

Relevance is conversion fuel — the more the page feels made for *this* visitor and
*this* click, the better it converts. (🟢 the scent principle is primary-sourced to
NN/g's broader work via CXL; treat specifics as established practice.)

- **Message match / "maintaining scent."** Keep the **verbal and visual "scent"
  continuous** from ad → landing page → conversion. The headline should echo the
  ad's promise and keywords; the imagery and offer should match. Breaking scent
  (different wording, different offer, generic homepage) spikes bounce and **wastes
  ad spend.** `[CXLs]`
- **Dedicated page per campaign/segment.** Don't send paid traffic to a generic
  homepage; build a focused page per offer/audience. One ad promise → one matching
  page.
- **Dynamic Text Replacement (DTR).** Swap headline/keywords to mirror the exact
  search term or ad variant, so every visitor sees their own query reflected back.
- **Audience/segment personalization.** Tailor copy, social proof, and imagery by
  industry, role, geography, device, or funnel stage when you have the data —
  relevant proof (logos/testimonials *like the visitor*) converts harder.
- **Honor intent and temperature.** Cold paid traffic needs more education and trust
  before the ask; warm email traffic can convert faster (recall the channel data,
  §2.2 — but it's an intent artifact, not page magic). `[U24]`
- **Personalize responsibly.** Respect privacy/consent; don't be creepy. Test that
  personalization actually lifts conversion — it isn't free of complexity or risk.

---

## 16. Common mistakes & anti-patterns

A consolidated "what kills conversion" list. (⚪ established; ⛔ marks the two
specific stats that **failed verification** — don't repeat them.)

**Strategy & focus**
- ❌ **Multiple competing goals / CTAs** — diluted attention, lower conversion.
- ❌ **Sending paid traffic to the homepage** instead of a dedicated, message-matched
  page.
- ❌ **Full site navigation** that leaks attention off the conversion path.
- ❌ **Treating best practices as laws** and skipping testing. `[CXLf]`

**Message & copy**
- ❌ **Vague or clever-over-clear headline** that doesn't state the value.
- ❌ **Message mismatch** between ad and page (broken scent). `[CXLs]`
- ❌ **Feature-dumping** with no benefit/translation; "we" language instead of "you."
- ❌ **Copy too complex** — higher reading level correlates with lower conversion.
  🟢`[U24]`
- ❌ **Generic CTA copy** ("Get Started"/"Submit") that misleads or under-motivates.
  🟢`[NNg]`
- ❌ **Walls of text** that ignore F-pattern scanning. 🟢`[NNf]`

**Forms & friction**
- ❌ **Too many form fields** / asking for data you don't need yet.
- ❌ **Placeholder-as-label**, multi-column forms, vague error messages, form-wipe on
  error.

**Trust**
- ❌ **No social proof**, or **generic/anonymous** testimonials.
- ❌ **Badge spam** that reads as spammy and *lowers* trust.
- ❌ **Hidden pricing / unclear terms / no risk reversal.**

**Visual & type**
- ❌ **Weak visual hierarchy** — CTA not dominant; everything shouts equally. 🟢`[NNv]`
- ❌ **Low-contrast text**, cramped line length, tiny body type. 🟢`[W3C]`
- ❌ **Clichéd stock photos** and decorative images that carry no message.
- ❌ **Too many typefaces.**

**Performance**
- ❌ **Lazy-loading the hero/LCP image** — directly harms LCP. 🟢`[WV]`
- ❌ **Unoptimized images, heavy third-party scripts, layout shift** from
  un-dimensioned media/fonts.
- ❌ **Ignoring mobile speed** — see the 53%/bounce data. 🟢`[GMS]`

**Mobile & accessibility**
- ❌ **Desktop-first** pages crammed onto phones; tiny tap targets; horizontal scroll.
- ❌ **Failing contrast / no keyboard access / missing labels & alt text.** 🟢`[W3C]`

**Measurement**
- ❌ **Peeking and stopping early**; ❌ **judging many metrics with no correction**.
  🟢`[GB][EM]`
- ❌ **Calling tests on tiny samples / partial cycles**; ❌ **no analytics at all.**

**⛔ Do NOT cite these (failed verification):**
- ⛔ "Simpler SaaS copy converts **514% better** (12.9% vs 2.1%)." — refuted.
- ⛔ "**1 second faster load → up to 27% more conversions.**" — refuted.

---

## 17. Pre-launch QA checklist

**Message & structure**
- [ ] One clear value proposition, above the fold, matching the source ad/email.
- [ ] Hero answers What / Why-me / What-next within ~5 seconds.
- [ ] Benefits lead; features support; product is *shown*, not just described.
- [ ] Social proof present and specific, near each CTA.
- [ ] FAQ answers the real objections; risk-reversal stated.
- [ ] Copy scannable, ~5th–7th grade reading level. 🟢

**CTA & forms**
- [ ] Primary CTA is specific, visually dominant, repeated; only one primary action.
- [ ] Form asks the minimum; single-column; persistent labels; good input types;
      inline validation; descriptive submit button.

**Visual & type**
- [ ] Clear hierarchy (size/color); restrained palette; CTA accent reserved.
- [ ] ≤2–3 typefaces; readable size, line length (~50–75 chars), and line height.

**Performance** 🟢
- [ ] LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 in **field** data.
- [ ] Hero/LCP image eager + preloaded; below-fold lazy-loaded.
- [ ] Images responsive/modern/compressed/dimensioned; fonts subset+preloaded;
      third-parties audited.

**Mobile & accessibility** 🟢
- [ ] Mobile-first layout; tap targets ≥44px; no horizontal scroll; readable without
      zoom; tested on real device + throttled network.
- [ ] WCAG 2.1 AA: contrast ≥4.5:1 / 3:1; keyboard operable; visible focus; labels &
      alt text; not color-alone; zoom to 200%.

**SEO**
- [ ] Title/meta/H1/URL optimized to intent; content crawlable; canonical set;
      structured data where relevant.

**Measurement** 🟢
- [ ] Analytics + primary metric live; conversion tracked end-to-end.
- [ ] First experiment: hypothesis written, sample size/duration pre-computed, no
      plan to peek.

---

## Sources & evidence grade

Citation keys used inline. **P** = primary source; **B** = blog/secondary
(corroborating). Verified findings were adversarially fact-checked (3-vote
majority) in the research pass that produced this doc.

| Key | Source | Grade | Used for |
|-----|--------|-------|----------|
| `[U24]` | Unbounce — **2024 Conversion Benchmark Report** (41k pages, 57M+ conversions) — `unbounce.com/conversion-benchmark-report/` (+ `/saas-conversion-rate/`, `/landing-pages/whats-a-good-conversion-rate/`) | P (vendor) | Conversion benchmarks, channel rates, readability |
| `[NNg]` | Nielsen Norman Group — *"Get Started" Stops Users* — `nngroup.com/articles/get-started/` | P | CTA copy / information scent |
| `[NNf]` | Nielsen Norman Group — *F-Shaped Pattern of Reading* (2006 + 2017 follow-up) — `nngroup.com/articles/f-shaped-pattern-reading-web-content-discovered/` | P | Scanning, front-loading copy |
| `[NNv]` | Nielsen Norman Group — *Visual Hierarchy* (video + article) — `nngroup.com/videos/visual-hierarchy/` | P | Hierarchy via color & size |
| `[WV]` | Google web.dev — **Core Web Vitals / LCP / INP / CLS** & *LCP & lazy-loading* — `web.dev/articles/vitals`, `/lcp`, `/inp`, `/cls`, `/lcp-lazy-loading` | P | CWV thresholds, eager-load LCP |
| `[GMS]` | Google / Think with Google — **Mobile Site Speed Playbook** (data ~2016–17) | P (dated) | 53% abandonment, bounce-vs-load curve |
| `[W3C]` | W3C — **WCAG 2.1** (SC 1.4.3, 1.4.11) + WebAIM contrast guide | P | Contrast minimums, AA |
| `[GB]` | GrowthBook — *Experimentation Problems* docs | P | Multiple comparisons, peeking |
| `[EM]` | Evan Miller — *How Not To Run an A/B Test* | P | Peeking / sequential testing |
| `[CXLs]` | CXL — *Maintaining scent for advertising ROI* | B | Message match / scent |
| `[CXLf]` | CXL — *Why conversion optimization best practices fail* | B | Best-practices-as-hypotheses |
| `[SMt]` | Smashing Magazine — *Best Practices of Combining Typefaces* & typography references | B | Font pairing |
| `[LA]` | Level Access — *Responsive design & accessibility* | B | Responsive/accessible overlap |

Additional corroborating sources reviewed in the research pass: foundrycro,
genesysgrowth, seosherpa, landingi, marketingcharts (benchmarks); MDN, DebugBear,
GTmetrix, 2025 Web Almanac (LCP/lazy-load); Wikipedia (family-wise error rate),
Spotify Engineering, Statsig, analytics-toolkit (experimentation).

---

## Caveats, source quality & things that got refuted

Read this before quoting any number externally.

1. **Conversion benchmarks are single-vendor (Unbounce) and median-based.** The
   6.6% median, 3.8% SaaS, 11.4–40.8% "good," 19.3% email channel, and readability
   figures all come from one platform's own pages. They carry **selection bias** —
   use them as **directional benchmarks, not universal truth.** `[U24]`
2. **Median ≠ "good."** The true cross-industry **median is only 6.6%**; the "good"
   11.4%+ is the **75th-percentile** threshold. Don't conflate them.
3. **Channel ranking is an intent artifact.** Email's 19.3% reflects a **warm,
   opted-in audience**, not channel superiority. Never benchmark a cold paid page
   against an email page.
4. **Mobile-speed stats are ~9–10 years old (2016–17) and correlational.** The 53%
   abandonment and 13%→60% bounce curve are still widely cited and directionally
   right, but are **not fresh and not proven causal.** `[GMS]`
5. **Visual hierarchy "primarily color & size" was the one non-unanimous finding
   (2–1).** Color and size are the *most-emphasized* importance cues, but NN/g's
   broader framing lists more signals. `[NNv]`
6. **Strongest, fully-current claims:** Core Web Vitals thresholds `[WV]` and WCAG
   contrast minimums `[W3C]` — primary specs from Google and W3C.
7. **⛔ Refuted in verification — do not cite:**
   - "Simpler SaaS copy converts **514% better** (12.9% vs 2.1%)." (1–2 refuted)
   - "Reducing load time by **1 second increases conversions up to 27%**." (1–2 refuted)
8. **Areas marked ⚪ (forms field-counts, trust-signal effect sizes, typography
   line-length/pairing specifics, framework conversion impact) are established
   professional practice, not individually fact-checked statistics here.** They are
   reliable as guidance; verify exact numbers (e.g., via Baymard, CXL, or your own
   tests) before quoting figures.

> **Final reminder:** these are strong priors to *generate hypotheses.* The only
> authority on your page is a well-run experiment on your own traffic (§14).
