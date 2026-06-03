# pcbnew (PCB editor) — bridge specifics

Differences from `0001-general-bridge-design.md`. pcbnew implements the **same unified bridge
contract** (general §1) with the **richest** native hooks of the three. Two things dominate its
specifics: **mandatory connectivity/ratsnest recompute** and **scale** (10k–100k+ items).

## Adapter — native (richest of the three) — and *why*
- **Identity free:** `BOARD_ITEM` ⊂ `EDA_ITEM` → `const KIID m_Uuid` (`include/eda_item.h:516`),
  serialized as `(uuid …)` on every item by `PCB_IO_KICAD_SEXPR` (e.g. track
  `pcb_io_kicad_sexpr.cpp:2619`, footprint `:1170`, zone `:2647`). Fast lookup via
  `std::unordered_map<KIID, BOARD_ITEM*> m_itemByIdCache` (`board.h:1458`). **No format change.**
- **Granular change set:** `BOARD_COMMIT::Push` (`pcbnew/board_commit.cpp:176–631`) tags each
  entry `CHT_ADD/REMOVE/MODIFY` and collects bulk add/remove/changed vectors.
- **Native observer — hook without patching core:** `BOARD_LISTENER` (`board.h:283–301`) is the
  richest interface — singular *and* bulk callbacks, plus a combined one:
  ```cpp
  OnBoardItemAdded/­ItemsAdded · OnBoardItemRemoved/­ItemsRemoved
  OnBoardItemChanged/­ItemsChanged · OnBoardNetSettingsChanged
  OnBoardHighlightNetChanged · OnBoardRatsnestChanged
  OnBoardCompositeUpdate(board, added[], removed[], changed[])   // ← one event, all three sets
  ```
  Registered via `board->AddListener(bridge)` (`board.cpp:2964`); fired through
  `InvokeListeners(...)` (`board.h:1424`). `BOARD_COMMIT::Push` → `OnItemsCompositeUpdate`
  (`board_commit.cpp:580` → `board.cpp:3001`). **`OnBoardCompositeUpdate` is the ideal single
  emit hook.**

## Model — typed containers (vs flat list / vs rtree)
8 typed containers, not one list (`board.h:1447–1455`): `m_footprints`, `m_tracks`, `m_zones`,
`m_drawings`, `m_groups`, `m_generators`, `m_markers`, `m_points`. The Yjs shape is still a
**flat uuid-keyed `Y.Array`** — `type` tells apply which container `BOARD::Add` routes to;
`m_itemByIdCache` resolves uuid→item in O(1).

## ChangeSource (emit)
`BOARD_LISTENER::OnBoardCompositeUpdate` → emit per-item JSON for added/changed (uuid+type+
fields) and uuid-only for removed. **Converter strategy: reflection for the bulk + native blob
for the long tail** — pcbnew uniquely has *both* generic mechanisms (general §3):
- (1) `BOARD_ITEM` is broadly `INSPECTABLE` (`board_item.cpp:427+`) → `PROPERTY_MANAGER`
  serializes most fields **write-once** with field-level merge.
- (2) `PCB_IO_KICAD_SEXPR::Format(const BOARD_ITEM*)` (`pcb_io_kicad_sexpr.h:351`, per-type
  `format(PCB_TRACK*/PAD*/ZONE*/…)`) gives a **free opaque blob** for any type reflection
  misses.

So: reflection-decompose the hot types you want field-level merge on (track width/endpoints,
position), blob everything else — **no hand-written per-type serializers**.

## apply — go through BOARD_COMMIT; recompute is MANDATORY
```cpp
BOARD_COMMIT commit( toolMgr );
// add:    item = deserialize(...); commit.Add(item)
// modify: item = board->GetItem(uuid); commit.Modify(item); …edit…
// remove: commit.Remove(board->GetItem(uuid))
commit.Push( "collab" );   // updates connectivity + recomputes ratsnest
```
`Push` updates `CONNECTIVITY_DATA` per item and calls `RecalculateRatsnest`. **Never** use
direct `BOARD::Add/Remove` for remote ops unless you also manually
`GetConnectivity()->Add/Update/Remove` + `RecalculateRatsnest()` + `OnRatsnestChanged()` —
the commit path does it correctly, so use it.

## Apply gotchas (enumerated)
- **Connectivity + ratsnest are mandatory** after any structural/net change — skipping
  corrupts net feedback. This is the single biggest difference from pl_editor.
- **Zones** are expensive — outline edits need a re-fill (not automatic).
- **Footprints** own child items (pads, fp text); their uuids live in `m_itemByIdCache` too —
  a footprint add/remove cascades (handled by `BOARD::Add`, `board.cpp:1239`).
- **Vias/teardrops/DRC** — drill changes ripple; `BOARD_COMMIT::Push` handles within commit.
- **Groups** — membership tracked by the commit.
- **Net settings** (`OnBoardNetSettingsChanged`) are board-global, not per-item — model as a
  separate doc field, not an items entry.

## Scale — the defining constraint
Real boards: 5k–20k items typical, 50k–500k for large designs. Implications:
- **Snapshot-on-change is non-viable** (per-commit serialization → MB; remote parse blocks UI).
  Granular deltas via the listener are **essential** here — never a whole-document approach.
- **Initial sync is itself heavy:** seeding a fresh `Y.Doc` from a 100k-item board must be a
  **batched, own-phase** operation (chunked transactions, possibly off the first paint), not a
  single emit. Flag as its own sub-task within the pcbnew commit.
- Prefer **opaque-blob** items to keep per-item payloads small and avoid a huge field-mapping
  surface across pcbnew's many types.
