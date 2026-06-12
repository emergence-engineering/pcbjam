# 04 — The KiCad catch-block audit

## Why an audit

Binaryen's asyncify cannot (yet) handle a suspension that begins while execution is inside
a wasm catch handler (see 05). Any C++ `catch` whose handler (directly or transitively)
opens a modal dialog, touches the async clipboard, etc., is therefore illegal under
`-fwasm-exceptions` + ASYNCIFY=1 today. KiCad's standard error pattern is exactly that:

```cpp
catch( const IO_ERROR& ioe )
{
    DisplayErrorMessage( this, ioe.What() );   // → ShowModal → Asyncify suspension
}
```

## Method

[`catch_audit.py`](catch_audit.py): walks `kicad/**/*.cpp` (excluding `thirdparty/`, `qa/`),
extracts every catch block with real brace matching (string/comment aware), and classifies
each handler body:

- **direct_suspend** — contains a known suspending call (`DisplayError[Message]`,
  `DisplayInfoMessage`, `wxMessageBox`, `ShowModal`, `ShowQuasiModal`, `KIDIALOG`,
  `IsOK(`, clipboard ops, `wxFileDialog`, …).
- **infobar** — only `ShowInfoBar*` (non-modal, non-suspending).
- **trivial** — only rethrow / capture / format / logging. Note `wxLogError` is *safe*:
  its GUI display is deferred to the idle-time log flush, outside any catch.
  `PGM_BASE::HandleException` (`common/pgm_base.cpp:805`) was manually verified — it only
  `wxLogError`s → benign.
- **needs_review** — calls functions not classifiable as benign; requires a transitive look.

Full output incl. all site locations: [`audit-results.txt`](audit-results.txt).
Re-run: `python3 catch_audit.py` (path to the kicad tree is hardcoded at the top).

## Results (2026-06-10, kicad @ wasm-port head)

| Category | Count |
|---|---|
| **direct_suspend** | **85** |
| needs_review | 93 (tail looks mostly benign — accessors/file ops; expect ~10–20 to become refactors on inspection) |
| trivial/safe | 458 |
| infobar-only | 0 |
| **total** | **636** |

Per app (direct/review): eeschema 37/17, pcbnew 32/29, common 9/35, cvpcb 3/1, rest
scattered. Concentrated exactly on the file-load error paths the e2e tests exercise:
`pcbnew/files.cpp`, `eeschema/files-io.cpp`, `footprint_libraries_utils.cpp`,
`symbol_library_manager.cpp`, the design-block utils.

wxWidgets adds essentially nothing (zero catch-with-dialog sites in its own code).

## The hand-refactor option (superseded by the fork, kept for the record)

Mechanical hoist per site:

```cpp
wxString err;
try { ... }
catch( const IO_ERROR& ioe ) { err = ioe.What(); }      // capture only
if( !err.IsEmpty() ) DisplayErrorMessage( this, err );   // suspend OUTSIDE the catch
```

Effort: 85 hoists (~15–30 min each; error-UX paths with near-zero test coverage) ≈ 3–5
dev-days; 93 reviews ≈ 2–3 dev-days; destructor-during-unwind audit ≈ half day (cleanup
pads = `catch_all`; dialogs from destructors expected zero); **plus** permanent
upstream-sync policing (every KiCad merge adds new `catch { DisplayError }` sites —
`catch_audit.py` as a CI gate automates detection), **plus** the fork-divergence cost
against the "stay close to upstream" policy. Total ~2–3 weeks one-time + maintenance tax,
with hard-crash failure modes for any missed transitive site (asyncify asserts mode traps
deterministically — good in CI, fatal in production).

**Verdict:** with the catch-arm-hoisting fork (05) this entire refactor becomes
unnecessary — all 85 direct sites are C++ catches, which the fork makes legal. Only
suspend-inside-`catch_all`-cleanup remains forbidden, which KiCad does not do.
