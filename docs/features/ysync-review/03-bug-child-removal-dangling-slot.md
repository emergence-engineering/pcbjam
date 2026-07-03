# Bug 03 — Child-only deletions leave a dangling `{item}` slot in the parent's Y body

**Severity:** high (poisons a room's render/materialize path; three-way divergence)
**Status:** open

## Where

- `web/pcbjam-shared/src/kicad-y.ts:152-181` — `applyDeltaToY` cleans up **root layout**
  slots for removed items but never prunes `{item: uuid}` slots from a surviving
  **parent's body**
- `wasm/bindings/pcbnew_embind.cpp:656-660` — `flushDiff`'s removed loop pushes raw
  uuids with no `liftBlob` counterpart (adds/changes lift a touched child to a parent
  re-blob; removals don't)
- `wasm/bindings/pcbnew_embind.cpp:831-844` — `doApplyItems` removed loop *skips*
  items with `GetParentFootprint()` ("covered by its parent's replace/remove")
- `web/pcbjam-shared/src/kicad-doc.ts:205-207` — `renderItemInner` throws
  `renderItem: missing item <uuid>` on a dangling reference

## Trigger

Delete a footprint **user field** (Footprint Properties → remove a field row) or a
footprint's user text child on the pcbnew board editor:

1. The child uuid vanishes from `forEachTopItem`'s snapshot → it lands in `removed`.
2. The footprint's own scalar json (`itemToJson`: id/type/x/y/layer) is **unchanged**,
   so no parent blob is emitted alongside — the wire is exactly
   `{ removed: [childUuid] }`.

## Consequences

Three states diverge simultaneously:

- **Y.Doc:** `applyDeltaToY` deletes the child item, but the parent footprint's body
  still contains the `{item: childUuid}` slot. From now on:
  - `renderItem(parent)` throws → `deltaToItemsWire` throws inside the `observeDeep`
    callback on **any** later remote change touching that footprint, aborting the whole
    batch's conversion (other items in the same transaction are dropped too).
  - `docToFile` throws → ydoc-mode materialization fails (WasmTool catches it and falls
    back to the API fetch, so opens survive, but the room can't be rendered).
- **Receiving editor:** the C++ removed loop skips the child (parent-footprint guard)
  → the peer *keeps* the field.
- **Sending editor:** the field is gone.

Partial mitigation that exists by accident: if the footprint is later modified, its
blob re-upserts the whole body (`upsertYItem` replaces `body` wholesale) and the
dangling slot disappears — the poison self-heals *only if* that footprint changes
again.

eeschema is not currently exposed to this specific trigger because symbol fields are
not visited by its snapshot at all (they're invisible to the differ — see
[04-bug-lossy-change-detection.md](04-bug-lossy-change-detection.md)), so a field
deletion there simply doesn't emit.

## Fix direction

Two layers, both worth doing:

1. **Emit side (root cause):** make removals lift like adds/changes do. In `flushDiff`,
   when a removed uuid's baseline entry belonged to a footprint child whose parent
   still exists, emit the parent's re-blob in `wChanged` instead of a bare child
   removal (mirror `liftBlob`'s dedup via `wDone`). The parent's new body then carries
   the correct child set end to end, and the C++ receiver's parent-replace covers the
   deletion naturally.
2. **Shared-lib side (defense in depth):** in `applyDeltaToY`, when deleting an item
   whose `parent` still exists in the items map, prune the `{item: uuid}` slot from the
   parent's body (a body rewrite via `upsertYItem`-style set). This keeps the
   "file recoverable from the Y.Doc alone" invariant unconditionally true, whatever a
   future emitter sends.

## Verification

Unit test in `kicad-y`/`items-wire`: apply `{removed:[child]}` where the parent
survives; assert `renderItem(parent)` and `docToFile` still succeed and the parent body
no longer references the child. Integration: delete a footprint user field on tab A,
assert tab B loses the field and the room still materializes.

Repro tests (2026-07-03): units in `web/pcbjam-shared/test/ysync-repros.test.ts`
(`renderItem: missing item` + `docToFile` through the dangling slot); e2e Y-half in
`tests/kicad/ysync-two-tab.spec.ts`, receiving + sending halves in
`tests/kicad/ysync-repros-pcbnew.spec.ts`.

**Empirical correction (finding F1 in
[16](16-repro-suite-results-and-empirical-findings.md)):** the sending half is WORSE
than the Trigger section above predicts — headless, a child-only delete commit never
triggers a flush at all (not even the bare `{removed:[child]}` wire goes out; the
snapshot-tracer shows `flushDiff` never ran). The emit-side fix therefore starts one
layer earlier: make the listener see the child-removal commit, THEN lift it to the
parent re-blob.
