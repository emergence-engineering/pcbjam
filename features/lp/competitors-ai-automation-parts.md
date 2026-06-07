# Competitive Analysis — AI / Automation / Parts & Adjacent EDA Tooling

Angle: AI-driven automation, version-control / Git-for-hardware, component-data, and manufacturing-adjacent players. These are the distinct-differentiator competitors (AI auto-layout, design-as-code, parts libraries, requirements) rather than the direct "EDA canvas in a browser" incumbents.

Relevance to our project ("KiCad in a web browser, with real-time collaboration"): these vendors define the marketing vocabulary for the modern, cloud/AI/collaboration framing — "weeks to hours," "Git for hardware," "pay per result, not per seat," "free parts library," "browser, no install." We can adopt or counter each of these framings.

---

## Quilter (quilter.ai) — Physics-driven AI auto-layout

- Hero headline: "PCB Layout in Hours, Not Months"
- Subheadline: "Quilter is physics-driven AI that automates PCB placement and routing."
- Value prop / positioning: Reinforcement-learning AI that explores thousands of candidate layouts and validates each against physics (signal integrity, impedance, differential pairs) before delivery. Frames itself as turning weeks of manual layout into hours. Tony Fadell quote: "turn weeks into days... a complete paradigm shift."
- Target audience: PCB designers, EEs, R&D managers in aerospace & defense, semiconductors, consumer electronics, robotics; mission-critical boards with tight timelines.
- Page sections: Product/Technology (Overview, Technology, Workflow); Solutions (by Design Type, Industry, Role); Resources (Blog, Workbench, Docs, Changelog); Pricing; Company; hero value prop; workflow integration; industry showcase; honest capabilities/limitations table; newsletter; footer.
- Feature claims: multiple candidates in hours; physics-aware validation per trace; "Upload Altium, Cadence, Siemens, or KiCAD projects directly"; parallel iteration across stack-ups/manufacturers/form-factors; handoff in original CAD format; "4-6 weeks off board bring-up."
- Social proof: AWS, NVIDIA, Siemens logos; Tony Fadell (iPod/iPhone/Nest) testimonial; $25M Series B (Oct 2025).
- Pricing: Free tier ("pay only for approved designs"); Enterprise scales by PIN COUNT, not seats — explicit anti-seat-licensing stance. Candidates within the first hour, bring-up-ready in a single workday.
- CTAs: "Talk to an Engineer" (primary), "Get Started," "Log in," "Check Product Updates."
- Differentiators: physics-first validation; RL candidate search; non-destructive (returns original format); transparent capabilities-vs-limitations table (honestly lists blind/buried vias, length matching, RF as in-development).
- Tone: confident-but-transparent, engineering-fluent, outcomes-oriented, "augment not replace" human-centered.
- Collaboration/browser/cloud angle: cloud-generated, tool-agnostic (imports/exports the major ECAD formats incl. KiCad). NOT a collaboration tool — it is an automation engine that plugs into existing seats. Our collab angle is orthogonal/complementary.

## JITX (jitx.com) — Design-as-code / software-defined electronics

- Positioning: "Software-defined electronics" — write code to GENERATE hardware (schematic + layout) instead of manually drafting. Parametric/programmatic design-as-code.
- Value prop: design boards faster with fewer errors by treating circuits as code; automated schematic generation, real-time DRC, 3D visualization, reuse via code.
- Target audience: software-leaning hardware engineers, teams wanting reproducible/parameterized designs and reuse.
- Feature claims: automated schematic generation, real-time design-rule checking, 3D circuit visualization, team collaboration, integrations with popular CAD.
- Pricing: ~$49/month subscription tier referenced.
- Differentiator vs us: code-first (text/Git-native by nature) rather than visual canvas. Strong fit for version control because designs are source code.
- Tone: developer/engineer-centric, automation-and-reuse framing.

## CELUS (celus.io) — AI design automation, drag-and-drop building blocks

- Positioning (German company): reduce electronics-design complexity via an easy drag-and-drop tool — pick required "building blocks," software auto-builds the rest of the design (the "CELUS Design Platform" / superhero-themed branding).
- Value prop: from idea/requirements to a buildable design automatically; component-aware automation.
- Target audience: hardware teams and component vendors wanting faster concept-to-design.
- Pricing: not publicly listed (enterprise/contact-sales).
- Angle vs us: AI concept-to-schematic automation, component-data driven; not a browser collaboration canvas.

## AllSpice.io (allspice.io) — "Git for Hardware" / version control + AI reviews

- Hero / positioning: "AI-powered design reviews for schematics"; the "Git for Hardware" platform — Git-based revision control, central collaboration hub, workflow automation, design analytics, compliance-ready audit trails.
- Value prop: connect native ECAD tools (Altium, etc.), get automated PCB/schematic/BOM redlines (visual diffs between revisions), design reviews, and releases in a web interface. "Software principles, optimized for hardware."
- Target audience: hardware/electrical/PCB engineers and enterprises needing revision control, reviews, compliance, audit trails.
- Page sections: home, Product, Features, Pricing, ebooks/resources ("Git for Hardware Guide"), blog (heavy SEO around "git for hardware / git for Altium").
- Feature claims: native ECAD support; automated PCB/schematic/BOM redlines; role-based permissions; audit trails; AI design insights; real-time collaboration. Uses Claude Sonnet 4.0 via AWS Bedrock for Cloud/Enterprise.
- Social proof: $24.8M raised (incl. $10M round), founded 2019, Boston; G2/SourceForge reviews; Greentown Labs member.
- Pricing model: per-seat by role — "Committer" (push/pull, edits) is paid; "Collaborator" (review/comment/view) is FREE and unlimited. Tiers scale Cloud → Enterprise.
- CTAs: book demo / get started.
- Differentiators: diff/redline engine for ECAD; sits ON TOP of existing tools (Altium etc.) rather than replacing the editor; compliance/audit focus.
- Tone: professional, enterprise, software-engineering-discipline-for-hardware.
- Angle vs us: closest "collaboration" competitor but it is a layer over existing desktop tools (revision control + review), NOT an in-browser editor. Our differentiator = the actual editing happens collaboratively in the browser, not just diffs of files committed from desktop seats. Note the free-reviewer / paid-editor pricing split is a model worth considering.

## SnapMagic Search (snapeda.com / snapmagic.com) — Free parts library (formerly SnapEDA)

- Hero / positioning: "Free PCB Footprints and Schematic Symbols" — online CAD library of symbols, footprints, 3D models, pinouts, datasheets for millions of components, with broad EDA interoperability and quality transparency.
- Value prop: "download millions of free symbols & footprints instantly to design better products faster"; "a million engineers each year build their products with SnapMagic."
- Target audience: every EE/PCB designer needing part models; also component manufacturers (syndication/SnapInsights as a B2B funnel).
- Feature claims: exports to Cadence OrCAD/Allegro, Altium, Mentor PADS, Eagle, KiCad, PCB123, Pulsonix; plugins for Eagle/Altium; DFM checker (silkscreen clearance, mask/paste, orientation, naming); mix of automated + manual creation.
- Social proof: "a million engineers" usage claim; broad manufacturer syndication.
- Pricing: basic individually-downloadable symbols/footprints "will always be free"; InstaPart on-demand part within 1 business day for $29 (<100 pins), +$20 for a 3D model; premium/enterprise + manufacturer-side products.
- CTAs: search/download; request a part (InstaPart).
- Differentiators: breadth of free parts + tool-agnostic export incl. KiCad; manufacturer-funded model (free to engineers).
- Angle vs us: adjacent/complementary, not a competitor — a parts source we could integrate (KiCad export already exists). Defines the "free parts library" expectation.

## Aisler (aisler.net) — EU PCB/PCBA manufacturing with CAD-integrated workflow

- Positioning: "Quick and affordable manufacturing for your Electronic Project" — agile, digital workflow from first prototype to large-scale PCBA; native CAD project management centralized; instant feedback/quotes.
- Value prop: simple, transparent pricing — "no hidden fees, just one fixed Job Fee and one variable fee"; EU manufacturing/delivery.
- Target audience: makers, startups, agile hardware teams (EU-centric).
- Feature claims: 1-business-day PCB fab (from ~$14.21 / €12 budget tier); assembled PCBA in ~6 business days; instant price calculator; native CAD project handling. Explicit partner integration with LibrePCB ("Your LibrePCB project manufactured").
- Pricing: Job Fee + variable fee; instant quote calculator.
- Angle vs us: manufacturing-adjacent. Notable that it advertises a LibrePCB (open-source EDA) integration — a template for an open-tool → fab pipeline our browser product could plug into.

## Valispace (valispace.com) — Requirements / systems engineering (now Altium)

- Positioning: "Where the world builds hardware" — capture requirements and link them to designs, systems, verifications and test cases for full traceability and agile iteration; "Requirements-as-data" / engineering budgets.
- Value prop: live, connected requirements + engineering budgets vs. static documents; faster, traceable iteration for complex hardware.
- Target audience: systems/requirements engineers, aerospace/space/complex-hardware teams (used in satellite projects).
- Feature claims: requirements engineering, traceability, engineering budgets, verification/test linkage, collaboration.
- Pricing: historically ~$995/yr flat; $1,000/yr education (unlimited students/professors). Acquired by Altium — relaunched as "Requirements Portal," now bundled in "Altium Develop" with unlimited collaborators.
- Angle vs us: adjacent (requirements layer, not schematic/PCB editing). Signals Altium's consolidation of the cloud-hardware stack (Altium 365 + Valispace/Requirements Portal + Upverter).

## Upverter (upverter.com, Altium) — Browser-native EDA (most direct cloud-collab analog)

- Positioning: full PCB workflow entirely in the browser — schematic capture, PCB layout, DRC, manufacturing output; no install; runs on any OS incl. Linux/macOS/Windows/ChromeOS.
- Value prop / "superpower": real-time multi-user collaboration "in a very Google Docs kind of way" — multiple users on the same schematic/layout simultaneously; fine-grained multilevel permissions; secure share without download/install.
- History: founded 2010, acquired by Altium 2017; now an Altium browser-based offering.
- Target audience: hobbyists, students, startups, distributed teams (power users still pushed to Altium Designer/KiCad for high complexity).
- Pricing: Starter $49/mo, Professional $199/mo, Enterprise; higher tiers add unlimited layers, enhanced collaboration, priority support.
- Angle vs us: the closest existing "browser EDA + real-time collaboration" competitor and the clearest direct comparison. Quilter even publishes a head-to-head "Quilter vs Altium 365 vs Upverter" cloud-tool guide. Our edge: KiCad-native (open-source familiarity, no proprietary lock-in, free) vs Upverter's proprietary/limited-complexity positioning.

---

## Cross-cutting takeaways for our positioning

1. The dominant AI framing is time-compression: "weeks/months to hours" (Quilter, JITX, CELUS). If we add AI assist, mirror this.
2. Two pricing innovations to consider: Quilter's "pay per approved result, not per seat" and AllSpice's "free unlimited reviewers, paid editors." Both undercut traditional seat licensing — relevant since our collab story implies many viewers/reviewers.
3. "Git for Hardware" (AllSpice) and "design-as-code" (JITX) own the version-control narrative. A browser KiCad with real-time collab can claim live co-editing as a step beyond async Git diffs — Upverter's "Google Docs for schematics" is the framing to beat.
4. Adjacents (SnapMagic parts, Aisler/LibrePCB fab) are integration opportunities, not threats — an open-source-friendly ecosystem story.
5. Upverter is the single most direct competitor; differentiate on KiCad-native + open-source + free + no-install + real-time collaboration.

## Sources
- https://www.quilter.ai/
- https://www.jitx.com/
- https://www.businesswire.com/news/home/20251007165399/en/Quilter-Secures-$25M-Series-B-to-Eliminate-Manual-PCB-Design-with-Physics-Driven-AI
- https://www.allspice.io/
- https://allspice.io/pricing
- https://www.snapeda.com/
- https://aisler.net/en-US
- https://www.valispace.com/
- https://www.valispace.com/pricing/
- https://en.wikipedia.org/wiki/Upverter
- https://www.quilter.ai/blog/the-2026-guide-to-cloud-based-pcb-layout-tools-quilter-vs-altium-365-vs-upverter
