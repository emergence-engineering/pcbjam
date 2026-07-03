# Bug 04 — Change detection is a lossy scalar projection; a whole class of edits silently never syncs

**Severity:** high (broad, silent non-replication of everyday edits)
**Status:** open

## Where

- `wasm/bindings/eeschema_embind.cpp:121-180` — `itemToJson` (the diff key), `:286-297`
  `snapshotItems` iterating `screen->Items()` only
- `wasm/bindings/pcbnew_embind.cpp:144-169` — `forEachTopItem` (what is iterated),
  `:176-252` — `itemToJson`
- `flushDiff` in both files — the v2 blob emit fires **only** for uuids whose scalar
  json differs from the baseline

## The structural problem

The v2 items wire carries lossless per-item s-expr blobs, but its **trigger** is still
the legacy scalar snapshot diff. `itemToJson` projects each item to a handful of
fields (id/type/x/y/layer + a few per-type extras). Any edit that doesn't change the
projection produces an empty diff → **no emit on either wire**, even though the
listener fired. Drift-detect eventually *reports* the divergence; nothing repairs it
([10-miss-no-repair-path.md](10-miss-no-repair-path.md)).

## Known-missed edits

eeschema:

- **Symbol rotate / mirror** — `GetPosition()` unchanged → invisible.
- **Reference / value / any field text edit** — fields are not in `screen->Items()`
  (they live inside the symbol), and the symbol's json carries no field text
  (`SCH_SYMBOL` is not an `EDA_TEXT`) → invisible. This is arguably the most common
  schematic edit after moving things.
- **Label / text rotation** — spins about the anchor; position unchanged → invisible.
- Stroke color and similar cosmetic properties not in the projection.

pcbnew:

- **Pad property edits** (size, shape, drill, net via pad dialog) — pads are
  deliberately not visited by `forEachTopItem` → invisible.
- **Zone properties** (net, hatch, priority, fill settings) — only `Outline(0)` points
  are compared → invisible. Holes / additional outlines are also outside the
  projection.
- **Graphic shape endpoint drags** — `Drawings` items' json is position-only. Dragging
  the *end* point of a segment leaves `GetPosition()` (the start) unchanged →
  invisible. (When the *start* moves, the change IS detected and the v2 blob replace is
  correct; the legacy `SetPosition` semantics would have translated instead of
  reshaping, but the legacy wire is dead in production.)
- **Footprint rotation** syncs only *by accident*: the field children's absolute
  positions move, which lifts the parent blob. A footprint whose fields sit exactly on
  the rotation anchor would not sync its rotation.

## Why fixing this properly is cheap

Two ingredients already exist:

1. The listener callbacks receive the **touched-item vectors**
   (`OnSchItemsChanged(…, std::vector<SCH_ITEM*>&)`, `OnBoardItemsChanged(…)`,
   `OnBoardCompositeUpdate(…)`) — currently ignored ("the listener is just a
   trigger"). Collect the uuids into a dirty set at trigger time.
2. The blob serializer (`itemBlob` / `blobForItem`) is the lossless comparison unit.

Post-settle, instead of diffing the full scalar snapshot, for each **dirty root**
(child uuids lifted to their parent, as `liftBlob` already does) compare the current
blob — or a hash of it — against the last-emitted blob hash, and emit on mismatch.
This:

- catches every serializer-visible property (rotation, field text, pad edits, zone
  settings) by construction;
- keeps the post-settle convergence property (the blob is taken after cleanup);
- shrinks the per-edit cost from O(all items) to O(dirty items) — the main lever of
  [12-opt-hot-path-full-model-work.md](12-opt-hot-path-full-model-work.md);
- lets the scalar snapshot/baseline machinery (and the legacy wire emit) retire.

Removals still need the baseline uuid set (a disappeared uuid can't be blobbed); keep a
uuid→(parent, blob-hash) map as the baseline instead of uuid→json.

Interaction with [05-bug-rebaseline-swallows-local-edits.md](05-bug-rebaseline-swallows-local-edits.md):
moving the baseline to uuid→hash makes the targeted post-apply rebaseline natural —
update hashes only for the uuids the apply touched.

## Verification

Per-tool e2e matrix of the missed edit list above (rotate symbol, edit value text,
edit pad size, drag shape endpoint, change zone net), asserting the peer converges and
drift-detect stays quiet.

Repro matrix (2026-07-03, each `test.fail` — see
[16](16-repro-suite-results-and-empirical-findings.md)):
`tests/kicad/ysync-repros-pcbnew.spec.ts` (anchor-centred footprint rotation — a
second fixture footprint with every child ON the anchor, so the "syncs by accident"
escape hatch is closed; pad resize; gr_line endpoint drag) and
`tests/kicad/ysync-repros-eeschema.spec.ts` (symbol rotation, Value-field edit). Each
case proves the edit LANDED (save poll) before expecting the emit; runtime-confirmed:
every one lands and none emits. Zone-net is the one matrix row without a hook yet.
