# Optimization 13 — Parked-dirty sheet rebind re-applies the entire sheet instead of the delta

**Severity:** performance + UX (heavy on big sheets; creates the adopt undo-bomb)
**Status:** open

## Where

- `web/standalone/src/wasm/collab/sheet-manager.ts:188-191` — a sheet revisited after
  any remote traffic while parked (`room.dirty`) is re-seeded with
  `binding.seed(undefined, { editorMatchesDoc: false })`
- `web/standalone/src/wasm/collab/kicad-binding.ts:176-188` — that adopt branch
  renders **ALL** doc roots (`renderItem` per root) and sends them as one
  `applyItems` batch; C++ `doApplyItems` then does remove+add for **every** item on
  the sheet, in one commit

## What it costs

A single remote edit to a parked sheet marks it dirty; the next `switchTo` then:

- renders every root item's full subtree s-expr from the Y view (O(sheet));
- ships one giant wire batch across embind;
- C++ parses every blob through the clipboard-paste path, removes and re-adds every
  item, runs one `Push` with full connectivity/ERC recompute;
- produces **one undo entry containing the whole sheet**
  ([09-miss-undo-not-collab-aware.md](09-miss-undo-not-collab-aware.md)) and resets
  selection/view state for everything.

The warm-pool design already pays the memory/connection cost to keep parked docs
current precisely so switches are cheap — then throws that away by re-applying
everything instead of the accumulated difference.

## Fix

The parked room already knows what changed — `startWatch` marks `dirty` on every
update. Two escalating options:

1. **Accumulate the parked delta.** Instead of a boolean `dirty`, buffer the
   uuid set of changed items while parked (the `update` event's transaction carries
   changed keys via `Y.decodeUpdate`, or cheaper: attach the standard
   `observeDeep` → `deltaFromYEvents` pipeline to the parked doc and accumulate into
   a pending `KicadDelta`, coalescing per uuid). On rebind, convert just that delta
   with `deltaToItemsWire` and apply it — identical code path to a live remote batch.
2. **Diff on rebind (no bookkeeping).** On rebind, parse `bridge.snapshotItems()`
   (already called for baselining), convert with `itemsWireToDelta` against the doc
   view, and apply only the resulting difference in the *editor* direction (doc
   authority: added/updated from doc side, removed for editor-only items). This is a
   generalization of the existing adopt that degrades gracefully — the empty diff
   case becomes the current "clean revisit" baseline-only branch, and the code paths
   unify.

Option 2 is more robust (it also self-corrects any drift the parked bookkeeping might
miss) and reuses existing conversion machinery; its cost is one editor snapshot per
rebind, which the seed already pays today.

Either way, the giant single-commit adopt shrinks to the real changed set, which also
shrinks the undo entry and the selection churn.
