# Optimization 12 — O(full-model) work on every edit, apply, and remote batch

**Severity:** performance (fine on demo boards; seconds-per-edit territory at 5–10k items)
**Status:** open

## The costs, per hot path

**Every local commit (C++):**
- `flushDiff` runs `snapshotByUuid` — `itemToJson` for **every** item on the
  board/screen (json allocation per item) — plus a full map compare against
  `g_baseline` (`pcbnew_embind.cpp:546-668`, eeschema `:374-453`).
- The legacy scalar wire is still built and emitted alongside the v2 wire even though
  production registers no `onDelta` listener (the json arrays are constructed
  regardless; the `EM_ASM` no-ops).

**Every remote apply (C++):**
- `rebaseline()` at the end of `doApply`/`doApplyItems` — another full-model
  `snapshotByUuid`.

**Every remote batch (TS):**
- The `observeDeep` handler builds `itemsView()` — `yToItem` for **every** item, each
  going through a zod `.parse` of its entire body tree
  (`kicad-binding.ts:82-88,116`). zod validation dominates; on a large board this is
  by far the most expensive step, and it runs even for a single-item remote nudge.
- `deltaToItemsWire`'s `coveredByAncestor`/`renderItem` only need the delta's items
  plus their ancestor chains and descendant subtrees — not the full view.
- `itemsWireToDelta` → `descendants()` rebuilds the full children index per wire item
  (`items-wire.ts:63-83`) → O(n·m) for an m-item wire.

**Drift check:** full scratch save + `fileToDoc` + `yToDoc` + `docDelta` — but only
every 50 doc updates and at unload; acceptable as designed. (The `beforeunload` check
is synchronous full-model work and will add visible tab-close latency on big boards —
worth a size guard, not a redesign.)

## Fixes, in leverage order

1. **Dirty-set + blob-hash diffing on the C++ side** — the same change bug
   [04](04-bug-lossy-change-detection.md) needs for correctness. Collect touched-item
   uuids from the listener callbacks (currently discarded), lift children to roots,
   and post-settle compare only those roots' blob hashes against a uuid→hash baseline.
   Replaces both full snapshots (flush AND rebaseline — see
   [05](05-bug-rebaseline-swallows-local-edits.md) for the targeted-rebaseline tie-in)
   and retires the scalar snapshot + legacy emit entirely. Per-edit cost drops from
   O(board) to O(edit).
2. **Kill zod on the TS hot path.** `yToItem`'s schema parse guards against malformed
   Y content, but the observer path re-validates the *entire* model on every batch.
   Either:
   - cache the materialized `KicadItem` per item Y.Map (WeakMap keyed by the Y.Map,
     invalidated from the event's changed keys), so a batch only converts touched
     items + the subtrees `renderItem` walks; or
   - validate at trust boundaries only (wire parse already zod-validates; Y reads can
     use a cheap structural cast) and keep zod for seed/materialize paths.
3. **Scope the view to the delta.** `deltaToItemsWire` needs `view` for ancestor
   chains and descendant rendering; build it lazily (resolve `items.get(uuid)` on
   demand) instead of materializing the whole map up front.
4. **Index children once per conversion.** Build the parent→children map once per
   `itemsWireToDelta` call, not per wire item.

Items 2–4 are contained TS changes; item 1 is the structural one and pairs with the
bug-04/05 fixes — do them as one piece of work.
