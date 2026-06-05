# Next-session prompt: fix the URL-detection wxRegEx modal on schematic load (WASM)

Paste everything below the line into a fresh session to work on this.

---

Fix the "Invalid regular expression … UTF-8 error" modal that pops up when eeschema
(WASM) renders a schematic containing text/symbol fields. Branch: `feature/web-init`.

## Symptom

Loading a schematic that has symbol fields / text (e.g.
`kicad/demos/ecc83/ecc83-pp.kicad_sch`) renders the schematic but immediately throws a
**modal dialog**:

```
KiCad Schematic Editor Error
Invalid regular expression '(https?|ftp|file)://([-\w+&@#/%?=~_|!:,.;]*[^.,;<>\s������])':
UTF-8 error: code points 0xd800-0xdfff are not defined
```

(The `������` are mojibake where `¶` U+00B6 should be.) It is **non-fatal** — the schematic
draws behind the dialog — but it blocks the UI and means URL detection in text is broken.
An empty / geometry-only schematic does NOT trigger it (that's why the load regression test
`tests/kicad/eeschema-load.spec.ts` uses wires/junctions only).

## Root cause (already localized)

`kicad/common/string_utils.cpp` has two static `wxRegEx` whose pattern ends in a negated
character class containing `¶` (¶, U+00B6):

- `LinkifyHTML()` ~line 672: `wxS( "\\b(https?|ftp|file)://([-\\w+&@#/%?=~|!:,.;]*[^.,:;<>\\(\\)\\s¶])" )`
- `IsURL()` ~line 683: `wxS( "(https?|ftp|file)://([-\\w+&@#/%?=~|!:,.;]*[^.,:;<>\\s¶])" )`

`IsURL()` is called during field/text rendering — `kicad/eeschema/sch_field.cpp:1042` &
`:1081`, `kicad/eeschema/sch_textbox.cpp:352`, `kicad/eeschema/fields_data_model.cpp:377` —
so any schematic with symbol reference/value fields hits it. The error is a **regex
COMPILE** failure of the static pattern (input-independent): the first `IsURL()` call
constructs the static `wxRegEx`, which fails to compile.

Hypothesis: under the emscripten/wxWidgets-WASM build the `¶` in the `wxS(...)` pattern
is mis-encoded (the dialog shows it as invalid UTF-8 in the 0xd800–0xdfff surrogate range),
so `wxRegEx` rejects the pattern. Native KiCad compiles it fine, so this is WASM-specific —
likely the wide-char literal handling and/or the `wxString → wxRegEx` UTF-8 conversion in
the wx-WASM port. NOT yet root-caused to the exact byte; that's step 1.

## What to do

1. Reproduce + pin the exact corruption. Add temporary logging that prints the pattern
   bytes (hex) right before the `wxRegEx` ctor in `IsURL()`/`LinkifyHTML()`, and compare
   what `¶` becomes in the WASM build vs. what it should be (`0xC2 0xB6`). Determine
   whether the corruption is at: the C++ wide/narrow literal, the `wxS`/`wxString` storage,
   or the `wxRegEx` UTF-8 conversion (`src/common/regex.cpp` / the wx-WASM regex backend).
2. Fix at the lowest correct layer. Prefer the wx-WASM layer (project rule: keep `kicad/`
   close to upstream, fix under `__EMSCRIPTEN__` in `wxwidgets/`). Candidate fixes, cheapest
   first — validate which is actually right after step 1:
   - If the `wxRegEx` UTF-8 conversion is the bug, fix it in the wx-WASM regex backend so
     non-ASCII pattern code points (e.g. `¶`) round-trip.
   - If it's the literal/encoding, build the pattern via `wxString::FromUTF8("…\xC2\xB6…")`
     instead of `¶`, or otherwise ensure correct encoding. (If this has to live in
     `string_utils.cpp`, guard it `#ifdef __EMSCRIPTEN__` and keep the upstream pattern for
     native — minimal divergence; run `scripts/kicad-diff-stats.sh` after.)
   - Last resort: drop `¶` from the WASM pattern (it only excludes the pilcrow from a
     URL's trailing char — cosmetic). Note this in a comment if chosen.
3. Verify: load a text-bearing schematic and confirm NO modal, schematic renders, and a real
   URL in a text field is still linkified (don't regress URL detection). Then re-run
   `tests/kicad/eeschema-load.spec.ts` (must stay green) and ideally add a text-bearing
   schematic case that would have shown the modal.

## Context you need

- The schematic LOAD path now works: the fiber/Asyncify hang was fixed by the trampoline
  self-heal shim in `scripts/common/inject-dyncall-shims.sh` (section "3c"). Don't touch it.
- Build eeschema (reuses prebuilt deps volume, ~5 min, don't build deps from scratch, don't
  run two builders at once — 32G each on a 37G Docker VM OOMs):
  `COMPOSE_PROJECT_NAME=kicad-wasm-feature-schematic ./docker/build.sh eeschema --debug`
  Then `cd web/apps/frontend && npm run link-wasm`. Build scripts log to files
  (`logs/build/*.log`) — don't pipe them.
- wxWidgets-only changes: `scripts/build-wxuniversal-wasm.sh` (on-machine, faster), then
  relink eeschema.
- The webapp's iframe is being removed this round (separate task) to simplify dev — so the
  app may load eeschema directly rather than in a same-origin iframe. The e2e harness
  (`tests/apps/kicad/eeschema.html`, loaded directly by Playwright) already runs iframe-free;
  it's the most reliable repro. Run kicad e2e from `tests/`: `npm run test:eeschema`.
- Symbolizing WASM stack frames (browser shows `wasm-function[N]` with no names): the separate
  `*.debug.wasm` is PRE-asyncify and useless. See memory `eeschema_wasm_symbolization` for the
  `--profiling-funcs` + asyncify `-g` recipe and the name-section index→name parser. Those are
  temporary debug build flags — re-add while debugging, remove before committing.
- Use debug tools / symbols, don't guess (CLAUDE.md). Temporary `fprintf(stderr,"[TAG] …")`
  shows as `[KICAD_ERR]` in the browser console; remove before committing.

## Memory pointers (read these first)

- `eeschema_schematic_load_crash` — full root-cause history of the load hang + this regex
  follow-up (the "NEW minor follow-up" note).
- `eeschema_wasm_symbolization` — how to get real C++ names into browser WASM stack traces.
