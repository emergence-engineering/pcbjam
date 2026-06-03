# Yjs collaborative bridge — general design (tool-agnostic)

Branch: `feature/yjs-bridge` (root + kicad + wxwidgets).
Goal: a bidirectional bridge between a KiCad editor's in-memory document model and a Yjs
`Y.Doc`, so local UI edits become CRDT ops and remote CRDT ops become model mutations.

This file is the **shared architecture**. Per-tool specifics live in:
- `0002-pl-editor-bridge.md` — drawing-sheet editor (first PoC).
- `0003-eeschema-bridge.md` — schematic editor.
- `0004-pcbnew-bridge.md` — PCB editor.

Each tool doc states **only its differences** from this file.

Decisions taken (2026-06-03):
- **CRDT representation: structured** — `Y.Array` of one `Y.Map` per item (stable id + fields).
- **First PoC transport: in-browser, no server** — two tabs share a `Y.Doc` via
  `BroadcastChannel`/`y-webrtc`. Server persistence is a later milestone.
- **First PoC target: pl_editor.**
- **One unified bridge contract for all three tools — no profile split** (see §1).

---

## 1. The unified bridge contract (one shape, per-tool adapters)

There is **one** bridge contract, identical for every tool. The C++ side exposes exactly two
things, and the JS side is fully generic:

```
                ┌───────────────────────── identical across all tools ─────────────────────────┐
  C++ editor → ChangeSource → per-item delta JSON → reconciler.ts → Y.Doc(items: Y.Array<Y.Map>)
  C++ editor ←   apply(delta) ← per-item delta JSON ← reconciler.ts ← Y.Doc ← provider ← peer
                └─ per-tool adapter ─┘                  └──────────── generic, schema-agnostic ──┘
```

- **`ChangeSource` (emit):** produces a stream of **per-item change events** — `added` /
  `removed` / `changed`, each carrying `{id, type, …fields}`. Emitted to JS as delta JSON.
- **`apply(delta)`:** consumes the same per-item delta JSON and applies it to the model.

Both directions speak the **same per-item vocabulary** for every tool. What differs is only the
**per-tool adapter** that *implements* `ChangeSource`/`apply` — an internal detail invisible to
the wire format, the JS reconciler, and the other tools:

| Tool | `ChangeSource` implementation | `apply` implementation | Identity |
|------|-------------------------------|------------------------|----------|
| eeschema | native `SCHEMATIC_LISTENER` | `SCH_COMMIT` Add/Modify/Remove + Push | native `KIID` |
| pcbnew | native `BOARD_LISTENER` (`OnBoardCompositeUpdate`) | `BOARD_COMMIT` Add/Modify/Remove + Push | native `KIID` |
| pl_editor | **in-bridge snapshot-differ** fired from `OnModify` | per-item mutate `DS_DATA_MODEL` by uuid + `SyncDrawItems` | **added** `KIID` (`0002`) |

eeschema/pcbnew get per-item events *natively* from their commit/listener systems. pl_editor
has none, so its adapter **derives** the same per-item events by uuid-diffing successive
whole-model snapshots inside the bridge (trivial at its scale) — and applies per-item by uuid.
The derivation is encapsulated in pl_editor's adapter; nothing downstream can tell the
difference. (We deliberately do **not** rewrite pl_editor's edit/undo core to a real `COMMIT` —
that would diverge heavily from upstream for no runtime benefit; decided 2026-06-03.)

So the only real per-tool work is: (1) pl_editor must **add** `KIID`+`(uuid)` to its format
(§2, `0002`); (2) eeschema/pcbnew must run the correct **recompute** on apply (connectivity /
ERC / ratsnest / hierarchy) by going through their native `COMMIT`.

---

## 2. Item identity (shared semantics)

A structured CRDT needs a per-item key that is (a) **identical on every client** and
(b) **stable across undo/redo**. The only way to guarantee both is for the id to live in the
**serialized form** of the item (so re-parsing — which undo does — preserves it, and two
clients opening the same file derive the same ids):

- **eeschema/pcbnew:** satisfied natively. Items derive from `EDA_ITEM`
  (`include/eda_item.h:516` → `const KIID m_Uuid`) and every item writes `(uuid …)`. Nothing to
  do; the uuid flows through KiCad ↔ JSON ↔ Y.Doc as the single source of truth, with **no
  cross-layer identity assumptions**.
- **pl_editor:** *not* satisfied natively — items have no `KIID` and `.kicad_wks` has no uuid
  token. We add **the same `KIID` + `(uuid …)`** the others use (not a bespoke id), so the three
  tools share one identity scheme (`0002`). Once added, identity behaves identically.

New items minted locally get a fresh `KIID`; it appears in the next emit, the reconciler keys
a new `Y.Map` by it, and remote peers create the item with that same uuid on apply.

**Backfill caveat for files lacking uuids.** When a tool *adds* uuids to a format (pl_editor),
legacy/upstream files have none, so they're backfilled on load. `KIID` backfill is **random,
not a deterministic content-hash** — so two clients cold-opening the *same never-saved* file
would disagree. Resolve via the **seed-once rule**: the client that finds the `Y.Doc` empty
seeds it and its backfilled uuids win; joiners adopt the `Y.Doc` instead of their own parse.
The first save then persists uuids, making all later opens consistent. (Deterministic
content-seed backfill is an optional later hardening; see `0002`.)

---

## 3. Wire schema + representation granularity

**The contract is minimal and schema-agnostic:** an array of objects, each with a string `id`
and `type`, plus arbitrary additional fields. The JS reconciler hardcodes **no** field names.

Each item's fields can be represented at one of two granularities — **chosen per item-type on
the C++ side; the JS reconciler is identical either way** (it just diffs values keyed by field
name):

- **Decomposed scalars** — `{id, type, x, y, text, …}`. Enables *field-level* merge (two
  people editing different fields of the same item never conflict). Best for small/hot types.
- **Opaque blob** — `{id, type, sexpr: "(segment …)"}` reusing the tool's native per-item
  serializer. *Item-level* merge granularity (concurrent edits to the same item conflict).
  Near-zero C++ mapping. Best for the long tail of complex types.

### Where the field values come from (don't hand-write N serializers)
There are three C++ mechanisms to produce the JSON for an item, in decreasing genericity. Pick
per tool; a tool may mix them and the JS reconciler is unaffected:

1. **`PROPERTY_MANAGER` reflection — write-once, all `EDA_ITEM` types (the "do it once" lever).**
   `EDA_ITEM`-based items register their fields generically (`REGISTER_TYPE` + `AddProperty`,
   e.g. `pcbnew/board_item.cpp:427+` — *"Position X"*, *"Layer"*, *"Locked"*, …). Enumerate
   `propMgr.GetProperties(item->GetTypeId())`, read each via `PROPERTY_BASE::GetValue → wxAny`
   → JSON; write back via `PROPERTY_BASE::Set`. **One converter covers every registered type**
   with field-level merge. Cost paid once: a `wxAny↔JSON` type bridge (ints/strings/bools,
   enums, `EDA_ANGLE`/`VECTOR2I` units). Coverage isn't 100% — a few unregistered fields still
   need (3). Primary path for **pcbnew** (broad coverage) and **eeschema** (partial).
2. **Native per-item S-expr blob — write-once *per tool that has one*.** pcbnew
   `PCB_IO_KICAD_SEXPR::Format(BOARD_ITEM*)`; pl_editor `DS_DATA_MODEL_IO::Format(model, item)`
   / `SaveInString({item}, &str)`. Serializes *any* of that tool's items with no per-type code;
   item-level merge only. (eeschema has no clean per-item formatter — document-level only.)
3. **Hand-mapped per-type fields.** Explicit, total control, works everywhere (incl. pl_editor,
   which has neither reflection nor `EDA_ITEM`). Most code — reserve for tools with few types
   (pl_editor's 5) or the hot fields you want field-level merge on.

(There is also `SERIALIZABLE`/`Serialize→protobuf::Any` on `EDA_ITEM`, but it targets the IPC
API — protobuf, partial coverage — wrong fit for JSON; not used here.)

A tool may mix granularities/mechanisms and refine over time **without any JS change**. Nested
data (polygon corner lists, bitmap blobs) is an opaque blob field or a nested `Y.Array`/`Y.Map`.
Numeric coordinates use the model's native units; the reconciler **quantizes before comparing**
to avoid spurious float diffs.

Optional **Zod schema as a validation guard only** at the apply boundary (reject garbage,
coerce number/bool/string) — never as a structural requirement.

---

## 4. The JS reconciler (`web/.../collab/`, identical for all tools)

A single generic module, parameterized only by the `Y.Doc` and the two bridge entry points:

- **Down (model → Y):** keep the last-seen item-set keyed by `id`. On each emitted per-item
  delta, write **only** the changes into the `Y.Array<Y.Map>`, inside one `Y.transaction`
  tagged with a local origin. (If an adapter ever emits a whole snapshot instead of a delta —
  it shouldn't, but pl_editor's differ could — the reconciler still diffs it to minimal ops, so
  the wire stays granular regardless.)
- **Up (Y → model):** observe the `Y.Array`; on remote-origin events, build the changed-item
  delta JSON and call the C++ `apply` hook. Ignore events whose origin is our own tag
  (standard Yjs echo-suppression).
- **Generic mapping:** an item ⇆ `Y.Map` is a flat copy of scalar fields; the diff is
  value-equality per key. Adding a C++ field needs zero JS change.

The reconciler is **adapter-blind** — it only ever sees per-item deltas keyed by uuid.

---

## 5. Loop / re-entrancy safety (shared)

- **`s_applyingRemote` guard** in the C++ bridge: set around `apply`; emit is suppressed while
  set. Prevents apply → (OnModify | listener fire) → emit → Y write → observe → apply … loops.
  Needed by every adapter (a native listener would otherwise re-fire on our own apply; the
  pl_editor differ would otherwise re-diff our own apply).
- **Asyncify timing:** apply is invoked from a JS callback and runs synchronously on the main
  thread between frames (same context as the existing `OnFileDropped`/`OpenFileCallback`
  hooks). It must not run mid-Asyncify-unwind — gate applies on the tool's ready/idle state and
  queue any that arrive during a suspension.
- **Yjs origin tags** on all reconciler transactions; observers skip their own origin.

---

## 6. Transport & persistence (shared, phased)

- **PoC:** two tabs, one `Y.Doc`, `BroadcastChannel` (or `y-webrtc`). Zero backend work.
- **Later (M-server):** `y-websocket` provider (standalone or folded into the Fastify server in
  `web/apps/server`) for networked sync + persistence; periodically materialize the Y.Doc back
  to the canonical `.kicad_*` file via the tool's normal save path.

---

## 7. Shared C++ bridge interface

A thin, `#ifdef __EMSCRIPTEN__`-guarded interface each tool implements, so JS is uniform:

- **Emit → JS:** `EM_ASM({ window.kicadCollab.onDelta(UTF8ToString($0)) }, json)` — `json` is a
  per-item delta. Same JS entry point for every tool/adapter.
- **Apply ← JS:** `EMSCRIPTEN_KEEPALIVE void kicadCollabApply(const char* json)` — dispatches to
  the active tool's adapter; wrapped in the `s_applyingRemote` guard.
- Copy the proven wx-layer pattern (`EM_ASM` out, `ccall`→`EMSCRIPTEN_KEEPALIVE` in).
- The collab code that touches tool models lives in the **kicad** fork; keep it tightly guarded
  and run `kicad-diff-stats.sh`. eeschema/pcbnew adapters add almost no surface (listener
  subclass + COMMIT calls). pl_editor adds the most: the `(uuid)` format token + the snapshot-
  differ adapter — but still leaves its edit/undo core untouched.

---

## 8. Phasing — one commit per step

1. **pl_editor interface/identity change.** `KIID m_Uuid` on `DS_DATA_ITEM` + `(uuid …)`
   keyword/parse(backfill)/save via the shared `FormatUuid`. Independently testable (uuid
   round-trip + legacy-file backfill-on-save). Commit. (`0002` §identity)
2. **pl_editor bridge + JSON converters (all 5 item types) + tests.** The snapshot-differ
   `ChangeSource`, per-item `apply` by uuid, the generic JS reconciler, `BroadcastChannel`
   transport, two-tab demo. Text/line/rect as scalars, poly/bitmap as blobs (`0002`). Commit.
3. **eeschema JSON converters + bridge + tests.** Adapter = `SCHEMATIC_LISTENER` + `SCH_COMMIT`;
   converters reflection-first (§3 mechanism 1) + hand-map gaps; multi-sheet hierarchy + symbol
   instances. Commit. (`0003`)
4. **pcbnew JSON converters + bridge + tests.** Adapter = `BOARD_LISTENER` + `BOARD_COMMIT`;
   converters = reflection (1) for the bulk + native blob (2) for the long tail; mandatory
   connectivity/ratsnest recompute; large-board batched initial-sync. Commit. (`0004`)
5. **Later — y-websocket + persistence** across all tools.

pl_editor goes first (steps 1–2) because its adapter is the only one we write from scratch and
it carries the least that can break (no connectivity, tiny docs); once the contract holds
there, the eeschema/pcbnew adapters are a thin re-use over native machinery.

---

## 9. Cross-cutting risks
- **Asyncify timing** of apply (§5) — needs a real under-load test.
- **Representation-granularity drift** — mixing blob and scalar per type must stay consistent
  across clients (the `type`→granularity decision lives in C++ and must be deterministic).
- **Coordinate precision** — quantize before diffing (§3).
- **Recompute side-effects (eeschema/pcbnew)** — applying outside the normal UI flow must still
  trigger connectivity/ERC/ratsnest/hierarchy; always go through the native COMMIT.
- **Initial sync cost (pcbnew)** — seeding a 100k-item board into a fresh `Y.Doc` is itself
  heavy; needs a batched/own-phase strategy (see `0004`).
- **Fork divergence** — pl_editor changes the `.kicad_wks` file format (fork-only files; see
  `0002`). eeschema/pcbnew adapters are near-zero divergence.
