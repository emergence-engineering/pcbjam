# Optimization 14 — Item-level body granularity: whole-item payloads per nudge, LWW drops concurrent property edits

**Severity:** known/documented v1 tradeoff — recorded here so its costs are visible when prioritizing
**Status:** open (deliberate design decision; revisit trigger below)

## Where

- `web/pcbjam-shared/src/kicad-y.ts:23-26` — the documented v1 choice: an item's
  `body` is ONE plain-JSON value → item-level merge; "deep Y types per slot
  (field-level merge inside one item) are the later refinement"
- `upsertYItem` (`kicad-y.ts:60-72`) — any body change rewrites the whole body value

## Costs as shipped

1. **Bandwidth / update-log growth ∝ item size, not edit size.** Nudging a footprint
   1 mm re-writes its full flattened subtree into the Y.Doc: the update ships the
   whole body JSON, and the sync server persists it in the room's update log until
   compaction. For a 100-pad footprint that's kilobytes per nudge. (The flatten
   already helps a lot — pads/fields/pins are separate items, so a *child* edit only
   re-writes the child + the lifted parent body — but the parent body itself embeds
   `{item}` refs plus all non-item slots, and pcbnew's `liftBlob` re-emits the parent
   for every child change.)
2. **Last-writer-wins at item granularity.** Two peers concurrently editing two
   *different properties* of the same item (one moves a text, the other edits its
   string) resolve by Yjs LWW on `body` — one peer's edit is silently discarded.
   Convergent, but lossy in exactly the case CRDTs are chosen for. The flatten means
   this only bites *within* one item (concurrent pad edits on the same footprint are
   fine — different items), which is why it's been acceptable so far.
3. Body comparison is `JSON.stringify` equality (`upsertYItem`, `sameKicadItem`) —
   fine at current sizes; becomes part of the hot-path cost at scale
   ([12-opt-hot-path-full-model-work.md](12-opt-hot-path-full-model-work.md)).

## The refinement path (when justified)

The `kicad-doc.ts` header already sketches it: map each `body`/`v` slot list to a
Y.Array of slot Y.Maps instead of one JSON value.

- Concurrent different-slot edits merge instead of LWW-dropping.
- Updates ship only changed slots.
- The zod schema remains the post-merge structural check (this is *why* slot lists
  were designed as uniform ordered arrays — the shape is already CRDT-ready).

Costs to respect:

- ordered-list CRDT semantics introduce interleaving anomalies for concurrent inserts
  at the same position (slot order is file order — usually stable, so low risk);
- the conversion layer (`itemsWireToDelta` / `deltaToItemsWire` / `yToItem`) must
  become slot-diff-aware — a meaningful rewrite of `kicad-y.ts`'s write path;
- per-slot Y overhead (item count × slot count Y structs) raises baseline doc size.

## Revisit trigger

Not worth doing speculatively. Revisit when either:

- server-side room storage / bandwidth per session becomes a measured cost, or
- concurrent same-item edits become a real reported UX complaint (e.g. two people
  routing in the same area fighting over one track's endpoints), or
- the [04](04-bug-lossy-change-detection.md)/[12](12-opt-hot-path-full-model-work.md)
  rework lands — that change touches the same conversion layer, and doing the slot
  refinement then amortizes the rewrite.
