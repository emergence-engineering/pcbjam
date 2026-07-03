# Bug 02 — Footprint blobs zero pad net codes; net data loss propagates to peers, the Y.Doc, and materialized files

**Severity:** high (silent, converging data corruption on boards with nets)
**Status:** open — runtime-CONFIRMED 2026-07-03: the snapshot blob carries the pads
with `(net 1 "SIG")` stripped (repro below)

## Where

- `wasm/bindings/pcbnew_embind.cpp:275-322` — `blobForItem`, specifically the footprint
  branch's `pad->SetNetCode( 0 )` loop (`:293-295`)
- Consumers: `flushDiff`'s `liftBlob` (`:593-618`), `pcbCollabSnapshotItems` (`:996-1019`),
  `doApplyItems` (`:822-894`)

## What happens

`blobForItem` copies clipboard `SaveSelection`'s "make safe to transfer" steps for
footprints, including zeroing every pad's net code before `Format()`. That is correct
for pasting into a *foreign* board (net codes are per-board indices), but the collab
wire connects peers editing the *same* board with identity-by-uuid — nets should
survive.

Concrete flow for a plain footprint **move** on the sender:

1. `flushDiff` sees the footprint's scalar json changed → `liftBlob` → footprint blob
   with **netless pads** goes out on the v2 wire (`wChanged`).
2. TS `itemsWireToDelta` re-flattens the blob; the pad items' bodies differ from the
   Y.Doc's (which still has `(net N "NAME")` from the file seed) → pads are `updated`
   → **the Y.Doc's pad bodies lose their nets**.
3. Peers receive the change, render the footprint from the (now netless) Y view, and
   `doApplyItems` does remove+add — **the peer's board now has net-0 pads** on that
   footprint. Ratsnest lines to it disappear; DRC connectivity changes.
4. The sender's own editor still has nets → the sender now permanently drifts from the
   Y.Doc (drift-detect will report it forever).
5. Once the *peer* touches the same footprint, its (already netless) blob flows back
   and the session converges on netless pads everywhere.
6. In `docSource: "ydoc"` mode the next open materializes the board from the doc
   (`docToFile`) — **the author's file itself loses pad nets across a reload**.

Also note: `pcbCollabSnapshotItems` (editor-snapshot seeding and adopt comparisons)
uses the same blob, so even the seed path bakes in the loss when the room is seeded
from the editor snapshot instead of the file. The file-seed path (`fileToDoc`)
preserves nets — until the first footprint edit destroys them.

## Why the "safety" step doesn't apply here

`MapNets` remapping only runs for the `(kicad_pcb …)` envelope parse
(`makeFromBlob`, `:346-368`); bare footprint blobs never get net remapping — they get
nothing, because the nets were already stripped at the source. Peers in a collab
session share the same net table lineage, so the paste-into-foreign-board rationale
doesn't hold.

## Fix direction

1. In `blobForItem`'s footprint branch, **drop the `SetNetCode(0)` loop** (keep the
   mandatory-field uuid restore and `SetLocked(false)`).
2. Verify on the receiving side that pad `(net N "NAME")` tokens parse correctly
   against the live board (`io.SetBoard(aBoard)` should resolve them). If net *codes*
   can diverge between peers after local edits, remap by **name** on apply (the same
   thing `MapNets` does for envelope boards) rather than trusting the code.
3. Add a regression test: seed a board with netted pads, move a footprint on tab A,
   assert tab B's pad nets AND the Y.Doc pad bodies still carry the nets.

## Repro

`tests/kicad/ysync-repros-pcbnew.spec.ts` "footprint blob preserves pad nets"
(`test.fail`), with the green "footprint blob embeds its pad children" precondition
pinning that only the nets — not the pads — are missing. See
[16](16-repro-suite-results-and-empirical-findings.md).

## Related

- [04-bug-lossy-change-detection.md](04-bug-lossy-change-detection.md) — pad property
  edits are separately invisible to the differ; this file is about the emit *payload*,
  that one about the emit *trigger*.
