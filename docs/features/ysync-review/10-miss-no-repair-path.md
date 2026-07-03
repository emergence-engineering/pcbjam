# Design miss 10 — Drift is detected and reported, never repaired; saves and the room can diverge with the room winning

**Severity:** design gap (turns every other bug from "transient" into "permanent")
**Status:** open decision

## Where

- `web/standalone/src/wasm/collab/drift-detect.ts` — computes the exact editor↔doc
  delta (`docDelta(ydocDoc, wasmDoc)` + `layoutChanged`/`metaChanged`) every N doc
  updates and at `beforeunload`, then… `reportDrift()` (telemetry) only
- `web/standalone/src/wasm/save-flow.ts` + `WasmTool.tsx:553,795` — `onSave` routes the
  saved bytes to the API/local disk; it does **not** reconcile the saved state into
  the Y.Doc
- `web/standalone/src/components/WasmTool.tsx:248-289` — ydoc-mode open prefers the
  room (`docToFile(yToDoc(doc))`) over the API copy whenever the room has state

## The two halves

**1. No self-heal.** Every divergence source in this review — apply failures (blob
parse errors are logged and skipped), the projection gaps
([04](04-bug-lossy-change-detection.md)), swallowed cleanup
([05](05-bug-rebaseline-swallows-local-edits.md)), skipped child removals
([03](03-bug-child-removal-dangling-slot.md)) — ends as a drift report and stays
diverged for the rest of the session. The ironic part: `computeDrift` already holds
the exact repair payload. `docDelta(ydocDoc, wasmDoc)` *is* the delta that would make
the doc match the editor; applying it via `applyDeltaToY` (tagged with the local
origin) is precisely what the DOWN path does for normal edits.

**2. Save vs room divergence, room wins.** The editor's Save writes the *true* model
(including everything the sync missed) to the API. The room is a separate store. On
the next ydoc-mode open, the room is preferred — so edits that drifted but were
correctly **saved** get silently dropped in favor of the stale doc. The author loses
work they explicitly saved. (When materialization *fails* — e.g. bug 03's dangling
slot — the API fallback accidentally preserves data better than the healthy path.)

## Fix directions

1. **Self-heal from the drift check (cheap, high leverage).** When `computeDrift`
   finds an item-level diff, don't just report — apply `body.diff` into the Y.Doc as a
   local-origin transaction (editor is the source of truth for *local* drift by
   definition: the wasm model is what the user sees). Guardrails:
   - only auto-apply the item diff; report-only for `layoutChanged`/`metaChanged`
     until [08](08-miss-layout-state-never-syncs.md) is decided;
   - cap the auto-applied delta size (a huge diff means something structural broke —
     report and stop rather than bulk-rewrite the room);
   - keep the report either way, flagged `repaired: true`, so telemetry still shows
     the underlying bug frequency.
   This one change converts bugs 03/04/05's permanent divergence into a bounded lag
   (≤ N doc updates or session end).
2. **Reconcile on save.** The `onSave` hook has the saved file text in MEMFS; run the
   same `fileToDoc` → `docDelta` → `applyDeltaToY` reconciliation there. Save is the
   user's explicit "this is the state I mean" signal — it's the natural sync barrier,
   and it fixes the save-vs-room precedence problem at the same time (after a save,
   the room *equals* the saved file, so "room wins on open" becomes harmless).
3. **Precedence tie-break on open (defense in depth).** ydoc-mode open could compare
   the API copy's mtime/content against the room and at least *warn* (or prefer the
   newer) when they disagree materially, instead of unconditionally trusting the room.

Recommendation: do 2 first (save is low-frequency, zero perf risk, biggest
user-visible win), then 1 with the size cap.
