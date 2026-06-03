# pl_editor (drawing-sheet editor) — bridge specifics

Differences from `0001-general-bridge-design.md`. pl_editor implements the **same unified
bridge contract** as the other two (per-item `ChangeSource` + per-item `apply`); it is the
**first PoC**. It has none of the native machinery, so its `ChangeSource` is the one adapter we
write from scratch — an **in-bridge snapshot-differ** — while its edit/undo core stays
untouched (low upstream divergence; Route 1, decided 2026-06-03).

## What pl_editor lacks natively (why its adapter is custom)
- `DS_DATA_ITEM` does **not** derive from `EDA_ITEM` (`include/drawing_sheet/ds_data_item.h:95`)
  → no `KIID`, and the `COMMIT` base operates on `EDA_ITEM*` so it can't take data items.
- **No COMMIT** anywhere in `pagelayout_editor/` (0 uses); undo is a whole-model S-expr snapshot
  (`SaveCopyInUndoList` → `DS_PROXY_UNDO_ITEM`) wired at 13 sites across 8 files.
- **No listener/observer** of any kind.
- Single change chokepoint: `PL_EDITOR_FRAME::OnModify()` (`pl_editor_frame.cpp:379`).

We do **not** rewrite that core. Instead the adapter derives per-item events by diffing, and
applies per-item by uuid — producing the exact same observable behavior as `SCH_COMMIT`/
`BOARD_COMMIT`, encapsulated entirely in the bridge.

## Model
- Singleton `DS_DATA_MODEL::GetTheInstance()`; `std::vector<DS_DATA_ITEM*> m_list`
  (`include/drawing_sheet/ds_data_model.h`). Flat, single-document — no sheets/screens, no
  connectivity/ERC (a big simplification vs eeschema/pcbnew).
- Item types: `DS_TEXT`, `DS_SEGMENT`, `DS_RECT`, `DS_POLYPOLYGON`, `DS_BITMAP`.
- `DS_DRAW_ITEM_*` render proxies are rebuilt by `DS_DATA_ITEM::SyncDrawItems(view)`; ephemeral.

## Identity — add the SAME `KIID`/`(uuid …)` as eeschema/pcbnew
Use the identical type + token + writer (general §2), not a bespoke id:
- Add `KIID m_Uuid;` to `DS_DATA_ITEM` (`include/kiid.h`). Default-constructed → **random**, so
  a new or uuid-less item is auto-backfilled in memory for free.
- Serialize with the shared helper `KICAD_FORMAT::FormatUuid( m_out, item->m_Uuid )`
  (`include/io/kicad/kicad_io_utils.h:55`) in `ds_data_model_io.cpp`, exactly as sch/pcb do.

### Save + load + backfill
- **Format:** add `uuid` to `common/drawing_sheet/drawing_sheet.keywords` (absent today). The
  wks lexer is **strict** (unknown token → `default:` → `Expecting()`/throws), so the token must
  be declared + handled — no silent passthrough.
- **Load:** `case T_uuid: item->m_Uuid = KIID( FromUTF8() ); NeedRIGHT(); break;` in each item
  parser (`drawing_sheet_parser.cpp`). If the token is absent, the parser leaves the default
  random `m_Uuid` in place → **automatic backfill**.
- **Save:** always write `(uuid …)` per item → the first save of a legacy/upstream uuid-less
  `.kicad_wks` **upgrades the file** in place.
- **Cross-client consistency:** files with uuids (our output, and any file after one save) →
  all clients agree. A never-saved uuid-less legacy file gets *random* backfill
  (`KIID(invalid)` → random, confirmed in `common/kiid.cpp` — not a deterministic hash), so two
  cold opens disagree; handled by the **seed-once rule** (general §2). Optional deterministic
  content-seed backfill (boost `name_generator` over type+name+pos+index) is deferred hardening.
- **Tradeoff:** files now carry `(uuid …)`; stock desktop KiCad's strict parser rejects the
  unknown token → fork-only files. Backfill makes the upgrade graceful.

## `ChangeSource` adapter — in-bridge snapshot-differ (emits per-item deltas)
The bridge holds the **last emitted snapshot** (a `uuid → fields` map). On `OnModify()`:
1. Serialize current `m_list` to a `uuid → fields` map — **all 5 types, none invisible**
   (rationale below): text/segment/rect as scalars; poly/bitmap as an opaque S-expr blob.
2. **Diff vs the cached map by uuid:** present-only-in-new → `added`; only-in-old → `removed`;
   in-both-with-changed-fields → `changed`.
3. Emit the per-item delta JSON via `EM_ASM window.kicadCollab.onDelta(json)`; update the cache.

This yields the same `added/removed/changed` per-item events the native listeners produce. The
diff is O(items) — negligible for drawing sheets. *(We could instead call the differ directly
from `OnModify`; optionally wrap it as a one-method `DS_DATA_MODEL` listener purely for
registration symmetry with sch/pcb — nice-to-have, not required.)*

## `apply(delta)` — per-item mutation by uuid
For each op in the incoming delta (inside the `s_applyingRemote` guard, general §5):
- **changed:** find `DS_DATA_ITEM` by `m_Uuid` in `m_list`; set the changed fields.
- **added:** create the item (with the given uuid), `DS_DATA_MODEL::Append`.
- **removed:** find by uuid, `Remove` + delete.
Then `SyncDrawItems` on touched items + canvas refresh, and **re-select by uuid** so a remote
apply doesn't drop local selection (a bonus the uuid unlocks). Optionally
`SaveCopyInUndoList()` once after a remote batch so local undo has a coherent checkpoint. **No
connectivity/ERC** — none exists for drawing sheets.

## Text-insert path (working UI flow targeted first)
`PL_DRAWING_TOOLS::PlaceItem` (`tools/pl_drawing_tools.cpp:72`) → `AddDrawingSheetItem(DS_TEXT)`
(`pl_editor_frame.cpp:823`) → `new DS_DATA_ITEM_TEXT("Text")` (fresh `KIID`) → `Append` →
`SyncDrawItems` → `SaveCopyInUndoList()` → `OnModify()` ← differ runs here → emits an `added`.

## Field mapping — all 5 types in one pass, at two fidelities
Cover every type so none is invisible to collaboration (see rationale). pl_editor has no
reflection (`DS_*` is not `EDA_ITEM`), so scalars are hand-mapped (general §3 mechanism 3) and
the awkward two reuse the existing per-item serializer (mechanism 2):

Shared: `id`(m_Uuid) · `type` · `name`(m_Name) · `x,y`(m_Pos.m_Pos, mm) · `anchor`(m_Pos.m_Anchor)
- **text** (scalars): `text`(m_TextBase) · `orient`(°) · `hjustify`/`vjustify` · `italic` ·
  `bold` · `sizeX,sizeY`(m_TextSize, mm) — field-level merge.
- **segment/rect** (scalars): `ex,ey`(m_End.m_Pos) · `eanchor` · `linewidth`(m_LineWidth).
- **poly/bitmap** (opaque blob): `sexpr` field from `DS_DATA_MODEL_IO::Format(model, item)` /
  `SaveInString({item}, &str)` — *no* nested corner-list / base64 field mapper to write;
  item-level merge. Refine to scalars later only if field-level merge is ever wanted.

**Why all 5, not just text/line/rect:** the adapter is a whole-model differ, so a type absent
from the snapshot is **invisible** — a user adding a polygon or logo bitmap simply wouldn't
sync. Including poly/bitmap as blobs closes that correctness gap at near-zero cost (the
serializer already exists). **Bitmap is safe** despite its large base64 payload: the differ
emits a field only when its value changes (string compare), so a static image is cached once
and never re-emitted — just keep it out of any per-keystroke re-encode path.

On **apply**, a blob item is reconstructed by parsing its `sexpr` back into a `DS_DATA_ITEM`
(wrap as a minimal model string → reuse `SetPageLayout`/the parser; a tiny parse-one helper).

## Build steps (maps to phasing commits 1–2 in general §8)
**Commit 1 — interface/identity:** `KIID m_Uuid` on `DS_DATA_ITEM` + `(uuid)`
keyword/parse(backfill)/save via `FormatUuid`. Build once; verify a `.kicad_wks` round-trips
uuids and a legacy file is backfilled on save.
**Commit 2 — bridge + converters (all 5 types) + tests:**
1. `common/drawing_sheet/ds_collab_bridge.{h,cpp}` (`#ifdef __EMSCRIPTEN__`): the snapshot-differ
   `ChangeSource` (cache + diff, emit on `OnModify`), `kicadCollabApply` per-item-by-uuid
   (incl. blob parse-one for poly/bitmap), `s_applyingRemote` guard.
2. Web: `yjs` + `BroadcastChannel` provider; the generic reconciler (general §4) + `WasmTool`
   wiring; optional Zod guard. Two-tab demo.
3. Verify: insert/move text & line & rect in tab A → mirrors in tab B and back; poly/bitmap
   round-trip via blob; selection survives remote apply (uuid re-select); e2e + screenshots.

## Risks specific to pl_editor
- Carries the **format-change divergence** (general §9) — the only tool that does.
- Its `ChangeSource` is a **derived** differ (not native tracking). Correct and cheap here, but
  the differ pattern is pl_editor's alone — eeschema/pcbnew use native events.
- Never-saved legacy-file cold-open identity race — mitigated by seed-once; deterministic
  backfill deferred.
