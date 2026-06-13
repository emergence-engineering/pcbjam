# `feature/wx-dom-port` — branch review (every change vs main)

**Date:** 2026-06-13
**Scope:** the complete diff of `feature/wx-dom-port` against each repo's mainline
(root `main`, kicad/wxwidgets `wasm-port`, pcbjam-shared `main`).
**Method:** the wx core touches, the async core, the JS layer, the build system,
and all root scripts/specs/docs were read line-by-line; the ~30 additive
`src/wasm/*` control files were read in full by four parallel readers and
cross-checked (especially for the menubar use-after-free class). Two baseline
screenshots were opened to confirm the renders are real.

## Verdict

Clean, careful, well-commented work that **reduces** the wxWidgets fork's
divergence from upstream rather than growing it, and leaves KiCad untouched.
The DOM-event architecture is sound (fresh-entry dispatch, freed windows
unregistered before destruction). There are a few real loose ends — one of
which (CI) is a functional breakage — plus two known feature gaps and two
latent lifetime/async hazards worth tracking. None of them block promoting the
branch.

## Fast-forward status

The branch is zero-divergence against every mainline (`behind: 0` everywhere),
so each promotion is a true fast-forward — no merge commit, no force.

| Repo | Target → feature | FF? | Commits | Notes |
|---|---|---|---|---|
| root | `main` → `feature/wx-dom-port` | yes | 23 | local `main` == `origin/main` (`14ca16c`) |
| wxwidgets | `wasm-port` → feature | yes | 20 | `origin/wasm-port` is an ancestor; HEAD `d33769ab56` |
| kicad | `wasm-port` → feature | no-op | 0 | feature HEAD `693c513293` **==** `origin/wasm-port` |
| pcbjam-shared | `main` → … | no-op | 0 | detached HEAD `92b2634` **==** `origin/main` |

Two mechanics to remember:

1. The feature branch is **unpushed** (no `origin/feature/wx-dom-port`), and the
   submodules have **no local `wasm-port` branch** — only `origin/wasm-port`. So
   "fast-forward `wasm-port`" is a fast-forward *push*, not a local merge:
   ```
   git -C wxwidgets push origin feature/wx-dom-port:wasm-port   # 20 commits
   # kicad: nothing to push (already == origin/wasm-port)
   git push origin feature/wx-dom-port:main                      # root, 23 commits
   ```
   Push **wxwidgets before root** so the published `main` references an
   already-published submodule commit.
2. pcbjam-shared's *local* `main` branch is stale (`5f27571`) vs `origin/main`
   (`92b2634`); irrelevant to the recorded pointer, just don't FF that local
   branch without fetching.

## What changed, by repo

| Repo | Net | Nature |
|---|---|---|
| **kicad** | 0 commits | Fork untouched — divergence not increased. |
| **pcbjam-shared** | 0 | Unchanged. |
| **wxwidgets** | +9,632 / −54,725, 161 files | The substance (below). The −54.7k is dominated by a junk `configure~` backup (−50,075) and the deleted canvas theme `src/univ/themes/wasm.cpp` (−2,960). |
| **root** | 36 text files + 339 baseline PNGs | Build-script renames, DOM test wiring, docs. |

## wxwidgets — full audit

### 1. Cleanup / divergence reduction
- Deleted `configure~` (a 50,075-line committed editor backup) and
  `src/univ/themes/wasm.cpp` (the 2,960-line canvas renderer the DOM port
  replaces).
- The `src/generic/*`, `src/aui/*`, `src/common/prntbase.cpp`,
  `src/propgrid/propgrid.cpp`, `src/stc/stc.cpp` touches are **all
  `__EMSCRIPTEN__`-gated** and are *removals/refactors* of the old canvas-port
  element-tracking hooks into a clean `wx/wasm/elementtracker.h` API
  (`WasmRegisterRenderedElement(...)` → `wxWasmTrackElement(...)`, and
  screen-coords → parent-relative for DOM positioning). Native builds are
  byte-identical; the WASM-side divergence shrinks.
  Representative: `framemanager.cpp`, `grid.cpp`, `tabg.cpp` (pure removal),
  `ctrlrend.cpp`. `prntbase.cpp` adds only `|| defined(__WXWASM__)` to one
  preprocessor condition (PostScript DC — no native printer in WASM).

### 2. Additive DOM port (~30 new `src/wasm/*.cpp` + `include/wx/wasm/*.h`)
Each wx control maps onto a real DOM element. Read in full and found clean
apart from the findings table below. Intentional stubs are clearly TODO-tagged.

- **Buttons / static:** `control`, `anybutton`, `button`, `bmpbuttn`, `tglbtn`,
  `checkbox`, `radiobut`, `stattext`, `statline`, `statbox`, `statbmp`, `gauge`.
  `bmpbuttn` intentionally pushes its bitmap twice (documented: `wxButton::Create`'s
  `SetLabel` clears the `<img>`).
- **Text:** `textentry` (mixin) + `textctrl` (`<input>`/`<textarea>`). Caret/
  selection cache logic is sound; an `m_inDomInput` re-entry guard prevents
  echo-back.
- **Choice / list / range:** `choice`, `combobox`, `listbox`, `checklst`,
  `radiobox`, `slider`, `spinbutt`, `scrolbar`. Item/client-data/selection
  arrays stay in lockstep; selection-index adjustment on insert/delete is
  correct.
- **Chrome / containers:** `frame`, `menu`, `menuitem`, `toolbar`, `notebook`,
  `tooltip`, `elementtracker`. The menubar `Detach()` fix
  (`parent->RemoveChild(this)` before the base) is present and correct (see
  `docs/features/async/10`); notebook tab-strip geometry reflow is sound.

### 3. wx core touches (`src/univ/*`)
Mostly net deletions of canvas element-tracking. The one substantial *unguarded*
change is **`univ/menu.cpp` (+98/−495): the universal popup menu's submenu/
overflow timers were removed** (`SUBMENU_TIMEOUT`, `m_subMenuTimer`,
`m_overflowTimer`, `OnOverflowTimer`, `HasOverflow*`, `OverflowArrowHitTest`,
mouse-wheel handling, `IsPointTrackingToSubMenu`), plus an event-table tweak
(`EVT_LEFT_DCLICK` → `EVT_LEFT_UP`, `+EVT_MOUSE_CAPTURE_LOST`). This is
asyncify-hostile machinery; it lives in shared univ code, but the fork only ever
builds WASM and the menu e2e tests pass. The paired `include/wx/univ/*.h`
changes are small interface adjustments (e.g. `GetScrollbarArrowSize()` made
pure-virtual).

### 4. Async core — highest-risk area, all sound
- **`domevents.cpp` (new):** `wx_dom_event` / `wx_dom_mouse` are top-level
  `EMSCRIPTEN_KEEPALIVE` entries — **fresh WASM entries, not re-entrant on
  Asyncify-suspended frames** — which is what makes DOM input safe even mid-modal
  (this resolves the original diagnosis plan's central fear). `~wxWindowWasm`
  calls `wxDomUnregisterWindow(m_domId)` *first*, so a freed window's stale
  `domId` is a harmless `gs_domWindows` lookup-miss.
- **`window.cpp`:** the DOM geometry/clip walk (`UpdateDomGeometry` /
  `ComputeAncestorClip` / `UpdateDomGeometryRecursive`) with the notebook
  client-area-origin correction; `OnDomEvent(FOCUSIN)` → `SetFocus` guarded by
  `gs_focusWindow != this`; destructor tears down the DOM node before
  `UnregisterElement`; `EraseBackgroundWindow` now fills the bg colour to avoid
  black pixels.
- **`app.cpp`:** mouse-wheel hierarchy walk (fresh event copy per hop, stops at
  handled/TLW); **stateless** keyboard arbitration via `document.activeElement`
  (documented rationale: Firefox doesn't fire `focusout` when a focused element
  is removed, which previously wedged a flag and swallowed all keys).
- **`clipbrd.cpp`:** net change is a clarifying NOTE that `js_clipboardHasText`
  must never run on the idle path. **`settings.cpp`:** a classic light
  system-colour scheme (else backgrounds erase to black). **`nonownedwnd.cpp`:**
  the main frame starts `m_isShown=true`. **`popupwin.cpp`:** drops an unused
  univ `EVT_SIZE` table.

### 5. JS layer
- **`build/wasm/wx-dom.js` (1,212 lines, new):** only 5 `console.error` calls,
  all legitimate error reporting; no stray `console.log`, no `debugger`, no
  TODO/FIXME/HACK.
- **`build/wasm/wx.js`:** adds one worker-guarded `window.__wxGetWindowElement`
  accessor; no canvas-port behaviour change.

### 6. Build system
`Makefile.in` / `build/bakefiles/files.bkl` / `configure` register the new files;
`include/wx/*.h` are mechanical `#elif defined(__WXWASM__)` dispatch hooks. The
MSW `makefile.gcc` / `makefile.vc` churn is bakefile-regeneration byproduct
(adding wasm widgets to `files.bkl` re-emitted every platform's makefile) —
harmless for a WASM-only fork.

## root — full audit

- **Build/infra renames** propagated consistently: `build-wxuniversal-wasm.sh →
  build-wx-wasm.sh`, `wxwidgets-universal → wxwidgets`, drop `--enable-universal`,
  lib prefix `wasmunivu → wasmu` (`docker/build.sh`, `env.sh`,
  `FindwxWidgets.cmake`, `build-kicad-target.sh`, `Makefile.wasm`,
  `gal-regression/wasm/Makefile`, README/CLAUDE/build.md).
- **Real fixes inside the renames:** `docker/build.sh` and `setup-kicad-wasm.sh`
  correct a wx.js source path (`build-wasm/wxwidgets/build/wasm/...` →
  `wxwidgets/build/wasm/...`) and ship `wx-dom.js`. `build-wx-wasm.sh` adds
  `autoconf_inc.m4`/`Makefile.in` staleness checks so new sources trigger
  reconfigure. `build-wasm-test.sh` adds `-j${JOBS}`. `Makefile.wasm` adds
  `wx-dom.js` as a second `--pre-js` to every link, lists `JS_FILES` as explicit
  prereqs (shim edits relink), and uses `$(filter %.o %.a,$^)` so the new `.js`
  prereqs aren't passed as link inputs.
- **Tests:** `boot.spec.ts` (new no-screenshot smoke: registry fills,
  `wxDomPort===true`, zero page errors); `appearance.spec.ts` (new DOM-port
  regression: notebook tab round-trips, wheel scrolling with viewport clipping,
  rows surviving tab switches); `wxwidgets.spec.ts` switches the `wxChoice` test
  to drive a native `<select>` via `selectOption` and bypasses Playwright's
  actionability check in `clickCanvas` (real elements now cover the canvas);
  `setup-kicad-wasm.sh` gets the wx.js path fix + `wx-dom.js` sync.
- **Docs:** new `docs/features/wx-dom-port/README.md` and `visual-notes.md`
  (architecture, e2e-verified status, known gaps, fork surface, phase-by-phase
  visual notes); the async dossier `08`/`09`/`10`.
- **Screenshots:** 338 baselines + 1 pre-existing root-level
  `wizard-04-finish-headless.png`; 319 modified / 8 added / 12 deleted — the
  expected re-render churn for a port that draws controls as DOM elements (the
  12 deletions include baselines for the removed choice-reopen steps). Spot-check
  confirmed real renders (wx form controls; KiCad pl_editor with native menu
  bar/toolbar/notebook).

## Findings

| # | Severity | Where | Issue |
|---|---|---|---|
| 1 | **High (functional)** | `.github/workflows/ci-ubicloud.yml:79` | Still runs `./scripts/build-wxuniversal-wasm.sh`, which no longer exists on this branch (renamed to `build-wx-wasm.sh`). The CI wxWidgets-build step would fail. The workflow file wasn't updated in the rename commit. (Also stale: a comment at `ci-ubicloud.yml:43` and `scripts/common/stages.sh:7`.) |
| 2 | **Fixed 2026-06-13** (was real, latent) | `src/wasm/textctrl.cpp` `OnDomEvent` | A throwing `wxEVT_TEXT` handler escaped `OnDomEvent`, leaving `m_inDomInput` wedged `true` and dropping every later programmatic `SetValue`/`ChangeValue` push. Reproduced deterministically (see below). An RAII guard did **not** fix it (destructors don't run during the asyncify+EH unwind); fixed by removing the persistent flag — `OnDomEvent(INPUT)` now calls `wxTextEntry::DoSetValue` directly (updates cache + fires the event, no echo-back push). |
| 3 | **Fixed 2026-06-13** (was real UAF) | `src/wasm/tooltip.cpp` + `window.cpp` | `gs_hoverWindow` (raw pointer) outlived its window; the 600 ms tooltip timer dereferenced freed memory. Reproduced (see below). Fixed by `wxWasmTooltipForgetWindow()`, called from `~wxWindowWasm`, which clears the pointer and stops the timer — same pattern as the existing `g_mouseWindow`/`gs_focusWindow` nulling. |
| 4 | Known gap | `src/wasm/window.cpp` (`DoPopupMenu`) | `wxFAIL_MSG("DoPopupMenu not implemented in the DOM port yet")` → context/right-click menus are stubbed (KiCad uses them). Tagged dom-phase-5. |
| 5 | Known gap | `src/wasm/scrolbar.cpp` | Scrollbar is a no-op stub (wheel-scroll works via `wxWindowWasm::ScrollWindow` moving children, but there is no draggable thumb). Tagged dom-phase-2. |

Minor / TODO-tracked (not bugs): `combobox` `SetSelection` lacks a bounds check;
`radiobox` per-item enable/show is cached but not reflected to the DOM;
`checkbox.cpp:95` / `radiobut.cpp:120` read the DOM value in `OnDomEvent` without
a null-guard (safe in practice — only fired on a live element).

## Bug reproductions and fixes (2026-06-13)

Findings #2 and #3 were turned into deterministic, self-contained
pure-wxWidgets repros, confirmed RED, then fixed (RED→GREEN). Afterwards the
full wx e2e suite is **294 passed / 1 skipped / 0 failed** (the 2 new specs
included — no regression).

- **Repro apps:** `tests/apps/standalone/textctrl-reentry/` and
  `tests/apps/standalone/tooltip-lifetime/`; spec
  `tests/e2e/dom-port-bugs.spec.ts`. The textctrl app links with `-fexceptions`
  (it throws from a handler); the tooltip app uses a small diagnostic accessor
  `wxWasmTooltipDebugHoverWindow()` kept in `tooltip.cpp`.
- **textctrl wedge (#2)** is real but **binary-layout-sensitive**: it first
  passed, then began reproducing 100% after an unrelated rebuild shifted the
  asyncify/EH function layout (so the throw stopped being contained by
  `wxEvtHandler::SafelyProcessEvent` before it escaped `OnDomEvent`). The fix
  removes the persistent `m_inDomInput` flag, so there is nothing left to wedge.
- **Gotcha worth remembering:** under this build (emscripten **legacy
  `-fexceptions` + `ASYNCIFY`**), **C++ destructors and `catch` landing pads do
  not reliably run while an exception unwinds through asyncify-instrumented
  frames.** RAII/try-catch cleanup that must survive a thrown exception is
  unreliable here — prefer designs that don't depend on unwind-time cleanup.
  (This is exactly why the obvious RAII fix for #2 did nothing and the flag had
  to be eliminated.)

## Leftovers to clean

- **The CI reference (#1)** — the one with real consequence if CI runs.
- **`docs/features/async/10`** status line still reads *"Full-suite validation
  across all apps + cleanup + commit pending"* — all of that is done.
- **`docs/features/wx-dom-port/visual-notes.md`** "Known-red kicad specs
  (asyncify scope, NOT this feature)" section is likely stale now that the
  menubar fix turned the kicad suite green.
- **Vestigial `const appsDir = 'apps'`** (single-use, no effect) in
  `tests/playwright.config.ts` and `tests/playwright-kicad.config.ts`.
- **Untracked `.agents/` + `AGENTS.md`** at the repo root — uncommitted and not
  gitignored (`AGENTS.md` mirrors CLAUDE.md's content; `.agents/skills/` mirrors
  `.claude/skills/`). They were *not* created by this branch's work.

## Cross-references
- `docs/features/wx-dom-port/README.md` — the feature overview / fork surface.
- `docs/features/wx-dom-port/visual-notes.md` — phase-by-phase visual notes.
- `docs/features/async/10-resolution-menubar-uaf.md` — the menubar UAF fix that
  closed the DOM-port asyncify-family regression.
