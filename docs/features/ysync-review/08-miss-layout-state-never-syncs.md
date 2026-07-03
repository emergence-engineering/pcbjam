# Design miss 08 — Non-item document state only syncs at seed; `lib_symbols` is a landmine for the symbol-libraries milestone

**Severity:** design gap (silent divergence for settings edits; structural blocker later)
**Status:** open decision

## Where

- `web/pcbjam-shared/src/kicad-y.ts:79-94` — `kdoc_layout` is written by `docToY`
  (seed) and only ever *appended to / pruned* by `applyDeltaToY` for root **items**;
  non-item layout slots are never updated live
- `web/pcbjam-shared/src/items-wire.ts:85-117` — `unwrapWireItem` deliberately strips
  the blob's envelope, including a symbol blob's `(lib_symbols …)` cache ("sender
  context, not document content")
- `wasm/bindings/eeschema_embind.cpp:786-808` — `doApplyItems`' `findLib` fallback
  chain: blob's own lib cache (stripped upstream) → live screen's cache → nullptr
- Drift flags: `web/standalone/src/wasm/collab/drift-detect.ts:110-115`
  (`layoutChanged` / `metaChanged` are computed and reported — but nothing consumes
  them beyond telemetry)

## What doesn't sync (by design, today)

Everything that lives in `layout` (non-uuid forms at the document root):

- eeschema: title block, paper size/orientation, `(settings …)`, `lib_symbols`
- pcbnew: `(setup …)` (design rules), net declarations (`(net N "NAME")` at root),
  layer table, title block / paper

A peer editing the title block or board setup diverges silently from the room and
from other peers; drift-detect reports `layoutChanged` forever and nothing repairs it
([10-miss-no-repair-path.md](10-miss-no-repair-path.md)). Because ydoc-mode opens
materialize from the doc, the *author's own* settings edit is lost on the next reload
(the saved file went to the API, but the doc wins on open — see the save-vs-room note
in [10](10-miss-no-repair-path.md)).

## The `lib_symbols` landmine

Today symbol placement is blocked (no bundled symbol libraries), which masks this.
When that lands:

1. Sender places a symbol → the emit's clipboard blob carries the symbol AND its
   `(lib_symbols …)` definition (that's what `aForClipboard` Format does).
2. `unwrapWireItem` **strips** the `lib_symbols` envelope → the definition never
   enters the Y.Doc.
3. Peers apply the symbol; `findLib` falls back to the live screen's cache — which
   doesn't have the definition for a symbol the peer has never seen → `nullptr` →
   symbol added without a `LIB_SYMBOL` (renders broken).
4. Worse, persistently: the room's `layout.lib_symbols` still has only the seed-time
   definitions, so `docToFile` produces a schematic referencing a lib id it doesn't
   contain — an invalid file.

## Fix directions

- **Short term (before symbol placement ships):** stop stripping `lib_symbols` on the
  eeschema wire. Either merge the blob's definitions into a dedicated
  `kdoc_libsymbols` Y.Map (keyed by lib id, LWW per definition — definitions are
  content-addressed-ish and rarely conflict), or fold them into the layout's
  `lib_symbols` slot on upsert. Mirror on apply: render the definitions into the wire
  so `findLib`'s first branch works.
- **Layout state generally:** decide per class:
  - *Settings/title block:* add a coarse "layout rev" sync — on local save (the
    existing `onSave` hook) diff the saved file's layout against the doc's
    (`docDelta` covers items; layout needs a slot-list compare, which
    `drift-detect` already does) and write changed non-item slots into `kdoc_layout`
    with LWW-at-slot-head granularity. Coarse but converging.
  - *Net declarations (pcbnew):* must be kept in step if/when net-creating edits are
    possible in the standalone; otherwise document explicitly that nets are
    seed-frozen.
- **Minimum bar if deliberately deferred:** document the freeze and make drift-detect's
  `layoutChanged` distinguish "expected class" (title block) from "unexpected"
  (missing lib_symbols), so telemetry stays actionable.
