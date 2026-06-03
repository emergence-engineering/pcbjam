# eeschema (schematic editor) — bridge specifics

Differences from `0001-general-bridge-design.md`. eeschema implements the **same unified bridge
contract** (general §1); its `ChangeSource`/`apply` adapter is a thin re-use of **native**
machinery, so most of pl_editor's hard work (`0002`) disappears here. Two genuinely new things:
**multi-sheet hierarchy** and **symbol instances**.

## Adapter — native (no derived differ, no format change) — and *why*
eeschema has the full machinery natively:
- **Identity free:** `SCH_ITEM` ⊂ `EDA_ITEM` → `const KIID m_Uuid` (`include/eda_item.h:516`),
  serialized as `(uuid …)` on every item by `SCH_IO_KICAD_SEXPR`
  (`eeschema/sch_io/kicad_sexpr/sch_io_kicad_sexpr.cpp:745,1047,1189,1322,…`; parsed in
  `…_parser.cpp:2777,3476,…`). **No format change** (contrast `0002`).
- **Granular change set:** `SCH_COMMIT` (`eeschema/sch_commit.h`), `Push()` loop
  (`eeschema/sch_commit.cpp:228–397`) tags each entry `CHT_ADD` / `CHT_REMOVE` / `CHT_MODIFY`.
- **Native observer — hook without patching core:** `SCHEMATIC_LISTENER`
  (`eeschema/schematic.h:60–71`):
  ```cpp
  virtual void OnSchItemsAdded   ( SCHEMATIC&, std::vector<SCH_ITEM*>& );
  virtual void OnSchItemsRemoved ( SCHEMATIC&, std::vector<SCH_ITEM*>& );
  virtual void OnSchItemsChanged ( SCHEMATIC&, std::vector<SCH_ITEM*>& );
  virtual void OnSchSheetChanged ( SCHEMATIC& );
  ```
  Register via `schematic->AddListener(bridge)` (`schematic.h:359`). `SCH_COMMIT::Push` fires
  these in bulk (`sch_commit.cpp:399–417`). → **emit is a listener subclass; near-zero fork
  divergence.**

So: no derived differ and no format patch here. The `ChangeSource` is the listener; `apply`
goes through `SCH_COMMIT`.

## Model — multi-sheet (the main structural difference)
- `SCHEMATIC` (`eeschema/schematic.h:87`) → virtual `m_rootSheet`, `m_topLevelSheets`,
  current `m_currentSheet`. Each `SCH_SHEET` owns one `SCH_SCREEN` whose items live in an
  `EE_RTREE` (`eeschema/sch_screen.h:98–117`).
- **Yjs shape:** because `m_Uuid` is globally unique, a **flat uuid-keyed `Y.Array`** still
  works, but each item's `Y.Map` must carry a **`screen`/`sheetPath` field** so apply knows
  which `SCH_SCREEN` to target. (Alternative: a `Y.Map` of screens, each a `Y.Array` of items
  — more structure, mirrors the model; decide during the eeschema commit. Flat+scope-field is
  simpler to start.)
- `OnSchSheetChanged` / hierarchy refresh must propagate as its own doc field/event.

## Symbol instances (the other new wrinkle)
A `SCH_SYMBOL` placed in a shared sheet appears on multiple sheet *instances*; per-instance
data (reference, unit) lives in `m_instanceReferences` (`SCH_SYMBOL_INSTANCE`). Editing the
shared symbol affects all instances; a remote change to reference/unit must update the right
**instance record**, not just the symbol. Treat instance data as nested fields keyed by
sheet-path within the symbol's item.

## ChangeSource (emit)
`SCHEMATIC_LISTENER` subclass → on `OnSchItemsAdded/Removed/Changed`, emit per-item JSON.
**Converter strategy: reflection-first** (general §3 mechanism 1) — `SCH_ITEM : EDA_ITEM`, so
use `PROPERTY_MANAGER` to serialize registered fields write-once; **hand-map (mechanism 3) the
gaps** where properties aren't registered. (Blobs are *not* an option here — see serialization
note.) Include the `screen`/`sheetPath` scope on every item.

## apply — go through SCH_COMMIT
```cpp
SCH_COMMIT commit( toolMgr );
// add:    create SCH_ITEM, commit.Add(item, screen)
// modify: item = schematic->ResolveItem(uuid); commit.Modify(item, screen); …edit fields…
// remove: commit.Remove(item, screen)
commit.Push( "collab" );   // triggers the recompute below
```
`Push` (`sch_commit.cpp`) runs the required side-effects:
- **Connectivity/ERC/netlist:** `frame->RecalculateConnections(...)` when any connectable item
  changed (`HasConnectivityChanges`); local vs global cleanup chosen automatically.
- **Hierarchy:** `schematic->RefreshHierarchy()` + nav update when a `SCH_SHEET` changed.

## Apply gotchas (enumerated)
- Connectivity is **bidirectional** — adding/removing a wire re-nets connected pins; never skip
  `RecalculateConnections`.
- **Symbol instances** — update the per-sheet instance record, not only the shared symbol.
- **Groups** — keep parent/child links in sync (`group->AddItem/RemoveItem`).
- **`SCH_FIELD` remove is special** — it hides, not deletes (`sch_commit.cpp:308`).
- **ERC markers** are uuid-tied; deletes orphan them (respect exclusions).
- **Selection** is transient UI state — never propagate.

## Serialization note (differs from pcbnew)
eeschema's I/O plugin is **document-level**, not per-item — there is **no** clean public
`Format(single SCH_ITEM)`, so the opaque-S-expr-blob path (general §3 mechanism 2) is *not*
available here. This is exactly why the converter is **reflection-first + hand-mapped gaps**:
fields via `PROPERTY_MANAGER` (or accessors), and on apply build complex items via `Clone()` +
field setters rather than re-parsing a blob.

## Scale
~500–5000 items typical (10k+ for large hierarchical designs). Granular deltas (listener) are
strongly preferred; whole-document serialization is expensive (hierarchy + uuid resolve +
connectivity). A pl_editor-style derived differ would be wrong at this scale — use the listener.
