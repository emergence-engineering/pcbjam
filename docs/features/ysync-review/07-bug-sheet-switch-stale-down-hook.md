# Bug 07 — Sheet switch leaves the DOWN hook pointing at the old room; cross-room contamination window

**Severity:** medium (small window on warm rooms; a full network round-trip — or forever — on cold/failed switches)
**Status:** open

## Where

- `web/standalone/src/wasm/collab/kicad-binding.ts:191-195` — `KicadBinding.destroy()`
  only calls `items.unobserveDeep(observer)`; the DOWN hook registered via
  `bridge.onItems(...)` (→ `window.kicadCollab.onItems`, `moduleItemsBridge`
  `:216-222`) is **never unregistered**
- `web/standalone/src/wasm/collab/sheet-manager.ts:158-203` — `doSwitch`: destroys the
  old binding synchronously, then `await ensureRoom(sheetPath)` (network for a cold
  room), then `bindKicadCollab` re-registers `onItems`
- UP-side mirror: `wasm/bindings/eeschema_embind.cpp:935-943` — a queued
  `schCollabApplyItems` CallAfter applies to `aFrame->GetScreen()` — whatever sheet is
  active **when it runs**, not when it was queued

## The DOWN-side hole (main issue)

Between `old.binding.destroy()` and `bindKicadCollab(room.doc, bridge)` there is an
async gap. During that gap `window.kicadCollab.onItems` still points at the **old
binding's closure**, which writes into the **old sheet's Y.Doc**.

The C++ side has already rebaselined to the new screen (`OnSchSheetChanged` →
`rebaseline()` fires from `DisplayCurrentSheet` before the JS switch completes), so a
local edit in the gap emits a *new-sheet-scoped* diff — and the stale hook applies it
to the *old* room:

- the old room's doc gains the new sheet's items (`applyDeltaToY` upserts them and
  appends root layout slots);
- peers bound to the old room receive them and **add the wrong sheet's items to their
  editor screens**;
- the old sheet's materialized file now contains foreign items.

Window size:

- **Warm room** (already in the pool): one microtask — tiny but nonzero.
- **Cold room** (`switchTo` before `connectAll` finished warming it): a full
  provider connect + `whenSynced()` round-trip.
- **Failed switch** (`ensureRoom` throws — network down): `doSwitch` aborts with
  `activePath = null` and **no retry**; the stale hook stays live indefinitely, and
  every subsequent edit on the new sheet flows into the old room until the user
  navigates again successfully.
- **Coalesced rapid navigation**: superseded switches are skipped
  (`requestedPath !== sheetPath`), correctly — but the hook keeps pointing at the last
  *bound* room, which may be several sheets back, until the final switch completes.

## The UP-side mirror (smaller)

An `applyItems` already queued into the C++ CallAfter pipeline before a navigation
lands on the **new** screen: `doApplyItems` resolves `existing` hierarchy-wide (fine)
but `commit.Add(item, aFrame->GetScreen())` targets the now-active sheet — items from
sheet A's room can be added to sheet B's screen. Sub-frame window; lower priority than
the DOWN side but the fix below covers it too.

## Fix direction

1. **Detach the DOWN hook in `destroy()`**: give the bridge an `offItems()` (or have
   `bindKicadCollab` install a wrapper that checks a `destroyed` flag and drops — or
   buffers — emits). Dropping is acceptable only if the C++ baseline is rolled back;
   otherwise the edit silently never syncs (a mini version of bug 05). Better:
   **buffer** emits while unbound and let the next `seed()`'s adopt/baseline pass
   reconcile them (the adopt already reconciles editor↔doc wholesale, so buffered
   emits can simply be discarded *after* a successful adopt-bind — the adopt reads the
   editor's current truth).
2. **Generation-tag the apply path**: include the target sheet path (the room's file)
   in the wire envelope and have `doApplyItems` verify it against
   `currentScreen()->GetFileName()`, dropping mismatches. This closes both the UP-side
   race and any residual DOWN-side echo.
3. **Retry / re-run failed switches**: on `ensureRoom` failure, keep `requestedPath`
   and re-attempt (with backoff) instead of leaving the editor unbound.

## Verification

Sheet-manager unit test: destroy old binding, delay `ensureRoom` (fake provider),
fire `onItems` during the gap, assert the old doc did NOT change. Integration:
throttle the network, navigate to a cold subsheet and immediately draw a wire; assert
the wire lands in the new sheet's room only.

Repro (2026-07-03): `web/standalone/src/wasm/collab/ysync-repros.test.ts` — 07a
(post-`destroy()` emit must not write into the doc) and 07b (REAL sheet-manager +
REAL kicad-binding + REAL yjs with only `connectKicadDoc` faked; the cold-switch gap
is held open and the stale hook's emit lands in the old sheet's doc). Both `it.fails`.
See [16](16-repro-suite-results-and-empirical-findings.md).
