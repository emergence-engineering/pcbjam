# Baseline — pre-fix state (2026-06-12)

Artifacts under test for the KiCad baseline run:
- `output/pcbnew.js` + `output/eeschema.js` from `docker/build.sh pcbnew,eeschema`
  started 14:20 (container rsyncs source at start → consistently PRE-fix wx:
  async clipboard IsSupported, single-slot `Module._endModal`, silently-stalling
  modal/nested pumps). Shims as of the same moment: §3c trampoline heal INCLUDED,
  handlesleep.js WITHOUT the wakeUp "unwind" catch.
- This is the first build of these apps since `18a9de0` (trampoline heal) —
  the previously deployed artifacts predated it, which is why the load-pcb UI
  froze post-load in the user's earlier runs.

## Standalone harness reds recorded pre-fix

See `redgreen.md` — 3 reds (sleep-park unwind rejection; modal_in_modal_in_modal
stall; nested pump-error stall) + 2 ablation pins reproducing the historical
hang and clobber crash.

## KiCad e2e baseline run (npm run test:kicad, firefox)

- Full playwright summary: **40 passed, 2 skipped, 0 failed, 0 flaky** (1.5 m).
  Green-at-baseline because this is the first deployed build containing the
  §3c trampoline heal (`18a9de0`) — the freeze-after-load the user saw came
  from pre-heal artifacts.
- Failures classified pre-existing/unrelated: none (2 skips are by design).
- Asyncify errors present in logs DESPITE passing (the "before" evidence the
  post-fix rebuild must eliminate, currently tolerated by spec filters):
  - `logs/kicad/load-pcb/...pic-programmer....errors.log`:
    `RuntimeError: index out of bounds` — the clipboard 2 s `IsSupported`
    sleep clobber (wx fix: sync IsSupported).
  - `logs/kicad/calculator/...loads-calculator-frame.errors.log` and
    `...switch-to-color-code-panel.errors.log`: `uncaught exception: unwind` —
    the park throw escaping through a sleep's wakeUp (shim fix: handlesleep.js
    unwind catch).

## wxWidgets e2e regression (against the FIXED wx — the regression gate for
## the dialog.cpp/evtloop.cpp/clipbrd.cpp changes)

- Coroutine suite (firefox): 13 passed, 0 failed (49.8 s)
- Asyncify races suite (firefox): 7 passed, 0 failed (18.8 s)
- Full wx e2e (bundled chromium): **291 passed, 1 skipped, 0 failed, 0 flaky** (1.6 m)

No regressions from the modal LIFO resolver stack, pump resolve-on-error
changes, or the sync clipboard IsSupported.

## FINAL verification (post-fix rebuild of ALL 6 apps, tightened specs)

Specs tightened first: `'uncaught exception: unwind'` tolerance DELETED from
pcbnew.spec.ts/eeschema.spec.ts; load-pcb.spec.ts gained a hard clean-console
gate over 5 asyncify corruption signatures (before AND after board render).

- `npm run test:kicad` (firefox): **40 passed, 2 skipped, 0 failed, 0 flaky** (1.5 m)
- Signature sweep over every `tests/logs/kicad/` log
  (index out of bounds / indirect call to null / uncaught exception: unwind /
  invalid state / is not a function / Aborted(): **zero matches**
- `.errors.log` files produced by the run: **zero** (baseline had 5+, including
  load-pcb's `RuntimeError: index out of bounds` and calculator/gerbview's
  `uncaught exception: unwind` — all gone)
- Screenshot baselines: unchanged (no rendering impact).
