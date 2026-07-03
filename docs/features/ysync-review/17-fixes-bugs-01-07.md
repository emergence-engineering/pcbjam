# Fixes for bugs 01–07 (2026-07-03)

**Status:** all seven review bugs FIXED and verified — every repro from plan
[15](15-plan-repro-tests-and-v2-e2e.md) had its expected-fail marker removed and now
runs as a plain regression test. Final state: ysync unit suites green
(pcbjam-shared 98, standalone collab 37), ysync e2e **20/20** on chromium
(two-tab incl. both bug-01 tools, concurrent seed, bare child removal), collab
regression set (items-bridge, roundtrip, legacy collab specs, save-hook) 21
passed / 3 pre-existing skips on firefox.

The fixes were done in the review's suggested batches; fixing them also surfaced
and fixed **two bugs the review missed** (F5, F6 below).

## Batch 1 — bug 01 (one line, as advertised)

`kicad-binding.ts` seed()'s file-seed branch now calls `bridge.snapshotItems()`
— `ensureBridge()` registers the C++ change listener, and the differ gets a
baseline. See F5 for why the snapshot's *result* is now also used.

## Batch 2 — bugs 02 + 03

- **02:** dropped `blobForItem`'s footprint `pad->SetNetCode(0)` loop
  (`pcbnew_embind.cpp`). KiCad 10 formats pad nets by NAME and the parser
  resolves names against the receiving board (creating the net if absent), so
  the doc's "remap by name on apply" concern is satisfied by the format itself.
  The repro's `(net 1 "SIG")` assertion was updated to accept the KiCad 10
  name-only form.
- **03 (root cause, F1):** `BOARD_COMMIT::Push`'s CHT_REMOVE branch for footprint
  children never touched any listener vector — `OnItemsCompositeUpdate` was
  simply never called for a child-only delete. The kicad fork now pushes the
  parent footprint into `itemsChanged` there (a genuine upstream notification
  gap; candidate for upstreaming).
- **03 (emit):** `itemToJson` carries a `parent` uuid; `flushDiff`'s removal loop
  lifts a removed child whose parent survives to a parent re-blob on the v2 wire
  (`wRemoved` now diverges from the legacy `removed`).
- **03 (receive):** `doApplyItems`' removed loop only skips a child uuid when its
  parent footprint is itself in the same wire's removed set; a BARE child
  removal now removes the child.
- **03 (Y defense):** `applyDeltaToY` deep-prunes `{item: uuid}` slots from a
  surviving parent's body before deleting a child item — "file recoverable from
  the Y.Doc alone" holds regardless of emitter behavior.

## Batch 3 — bugs 04 + 05 (one change, both tools)

- The `COLLAB_LISTENER`s now CAPTURE the touched items (uuid strings at callback
  time; children lifted to their root — `GetParentFootprint()` on pcbnew, the
  symbol/sheet/label/table parent chain on eeschema) into a `g_dirty` set.
- `flushDiff` emits every dirty root's v2 blob unconditionally (deduped against
  the scalar-diff emits). Rotations, field text edits, pad/zone property edits,
  endpoint drags — anything serializer-visible — now reach the wire. The
  full-model scalar scan REMAINS: it feeds the legacy wire and catches
  eeschema's post-`Push` connectivity cleanup, which never reaches listeners.
  A no-op commit costs one blob serialization; the TS layer drops unchanged
  bodies, so nothing echoes.
- **05:** `doApplyItems` replaced the global `rebaseline()` with
  `rebaselineTouched(applied uuids)` (pcbnew also refreshes/erases the child
  entries via the baseline's `parent` field) and ends with `scheduleFlush()`.
  A local edit committed while the apply was queued keeps its pre-edit baseline
  and still emits; receiver-side cleanup broadcasts (idempotent on the sender).
- Global `rebaseline()` clears `g_dirty` (a sheet switch must not leak the old
  sheet's dirty marks into the new room).
- Legacy `doApply` keeps the global rebaseline (dead in production, apply-leg
  tests only).

## Batch 4 — bugs 06 + 07

- **06:** new shared primitive `seedDocToY(doc, ydoc, origin, nonce)` writes the
  seed nonce into `kdoc_meta` inside the seed transaction and returns a
  retractor that deletes exactly the layout slots that seed inserted (matched by
  insertion id — this client, this clock window — so slots appended by later
  edits survive; unit-covered). The binding's file-seed branch arbitrates via a
  `kdoc_meta` observer: if a foreign nonce wins the LWW merge, the loser
  retracts, leaving the winner's single clean layout. `kdoc_items` converges per
  key on its own. (Server-side seeding — fix direction 1 — remains the cleaner
  long-term design; this closes the race client-side without backend changes.)
- **07a:** `bindKicadCollab` gates the DOWN hook with a `destroyed` flag —
  `destroy()` makes the binding inert both ways. Gap emits during a sheet switch
  are dropped; C++ has already rebaselined to the new sheet, so applying them to
  the old room was pure contamination.
- **07b:** failed `switchTo` now retries with backoff (2s doubling to 30s,
  event-driven, reset on success) instead of leaving the editor unbound forever.
- Fix direction 2 (generation-tagging the apply envelope for the UP-side
  sub-frame window) was NOT done — still open, low priority.

## New findings while verifying (beyond docs 01–16)

### F5 — F4 was an artifact of bug 01; file-seeded bodies must be editor-normalized

Doc 16's F4 ("drift-detect is item-silent on the green path") only held because
bug 01 left the differ with NO baseline: the seeder's first edit re-emitted the
FULL model, silently overwriting the file-seeded Y bodies with the editor's
serialization. With bug 01 fixed, the pl_editor baseline drifted on every
file-seeded item (`(name border)` vs `(name "border")`, normalized geometry…).
Fix: the file-seed branch now uses `snapshotItems()`' RESULT — item bodies are
re-upserted in the editor's serialization (the steady-state form every future
emit produces; also what makes `upsertYItem`'s no-op skip effective). Meta +
layout stay file-derived. Consequence: a room's materialization is
editor-normalized, not file-verbatim — the bug-06 e2e was updated accordingly
(convergence + no-duplication, not byte-equality with the raw file render).

### F6 — the "asyncify-fragile envelope parse" was actually a layer-name bug

The 0008-era decision to keep track/via/zone/text APPLY off the v2 wire cited an
"asyncify-fragile `(kicad_pcb …)` envelope parse". Root cause found while fixing
the pcbnew bug-01 two-tab repro (whose apply leg it blocked):
`wrapInBoardEnvelope` wrote the envelope's layer table with `GetLayerName()`
(user-visible names), but the parser validates canonical names against the fixed
layer hash — any board with a layer whose display name differs from its
canonical one (every KiCad 10 board: "F.Courtyard" vs "F.CrtYd") threw
`Layer 'B.Courtyard' … is not in fixed layer hash`. Fixed with `LSET::Name()`.
`makeFromBlob` also no longer swallows parse errors — it logs
`[collab] pcbnew blob parse error: <IO_ERROR.What()>`, which is how this was
found. Bare track/via/zone/text changes now apply fine through the envelope
(verified: via moves converge across two tabs); the items-bridge PCB config's
"changed footprint only" scope note is stale and those types can gain coverage.

## Follow-ups (unchanged from 16, minus what this closed)

- Misses 08–10 (non-item state sync, collab-aware undo, drift repair) and
  optimizations 12–14 (beyond what the dirty set already delivers on the emit
  hot path) remain open.
- Retire (or un-skip) the legacy two-tab specs; add `localEdit` + track/via
  changed coverage to items-bridge (F3 + F6).
- Bug 07 fix direction 2 (envelope generation tag) if presence/multi-sheet work
  widens the UP-side window.
- Upstream the `board_commit.cpp` child-removal notification.
