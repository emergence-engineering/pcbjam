import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  docToFile,
  fileToDoc,
  itemsWireToDelta,
  kicadLibSymbolsMap,
  parseItemsWireDelta,
  renderItem,
  sexprToItems,
  yToDoc,
  type KicadItem,
} from "@pcbjam/shared";
import { bindKicadCollab, type KicadItemsBridge } from "./kicad-binding";

/**
 * A fake editor implementing the v2 items bridge over an in-memory flattened
 * item store — the same semantics the Stage C C++ side will have: apply() is an
 * idempotent per-item upsert/remove that does NOT re-emit (s_applyingRemote
 * analogue); local edits mutate the store AND emit the items wire.
 */
class FakeEditor implements KicadItemsBridge {
  store: Record<string, KicadItem> = {};
  applied: string[] = []; // raw JSON of every applyItems call (echo assertions)
  private emit: ((json: string) => void) | null = null;

  snapshotItems(): string {
    const roots = Object.entries(this.store)
      .filter(([, it]) => it.parent === null)
      .map(([uuid]) => ({
        sexpr: renderItem({ items: this.store }, uuid),
        parent: null,
      }));
    return JSON.stringify({ added: roots, changed: [], removed: [] });
  }

  applyItems(json: string): void {
    this.applied.push(json);
    this.applyToStore(json); // no emit — remote applies must not echo
  }

  onItems(cb: (json: string) => void): void {
    this.emit = cb;
  }

  /** A local user edit: mutate the store, then emit (like OnModify → Format). */
  localUpsert(sexpr: string, parent: string | null = null, kind: "added" | "changed" = "changed"): void {
    const json = JSON.stringify({ [kind]: [{ sexpr, parent }] });
    this.applyToStore(json);
    this.emit?.(json);
  }

  localRemove(uuid: string): void {
    const json = JSON.stringify({ removed: [uuid] });
    this.applyToStore(json);
    this.emit?.(json);
  }

  private applyToStore(json: string): void {
    const delta = itemsWireToDelta(parseItemsWireDelta(json), this.store);
    for (const it of [...delta.added, ...delta.updated]) {
      const { uuid, ...item } = it;
      this.store[uuid] = item;
    }
    for (const uuid of delta.removed) delete this.store[uuid];
  }
}

/** Two Y.Docs joined by relaying updates (stand-in for any provider). */
function pair(): { a: Y.Doc; b: Y.Doc } {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on("update", (u: Uint8Array) => Y.applyUpdate(b, u, "relay"));
  b.on("update", (u: Uint8Array) => Y.applyUpdate(a, u, "relay"));
  return { a, b };
}

const FP = `(footprint "lib:R" (layer "F.Cu") (uuid "fp-1") (at 10 10)
  (property "Reference" "R1" (at 0 -2) (uuid "fld-1"))
  (pad "1" smd (at 0 0) (uuid "pad-1")))`;

function seedEditor(ed: FakeEditor, sexpr: string): void {
  const { uuid, items } = sexprToItems(sexpr);
  void uuid;
  Object.assign(ed.store, items);
}

describe("bindKicadCollab — two editors over relayed Y.Docs", () => {
  function setup() {
    const { a, b } = pair();
    const edA = new FakeEditor();
    const edB = new FakeEditor();
    const bindA = bindKicadCollab(a, edA);
    const bindB = bindKicadCollab(b, edB);
    return { a, b, edA, edB, bindA, bindB };
  }

  it("seed → add → edit → remove propagates both ways; no self-echo", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed(); // A is first: seeds the doc
    bindB.seed(); // B joins: adopts the doc

    // B's editor received the footprint subtree via adopt.
    expect(Object.keys(edB.store).sort()).toEqual(["fld-1", "fp-1", "pad-1"]);

    // B edits the pad locally → A's editor sees it.
    edB.localUpsert(`(pad "1" smd (at 7 7) (uuid "pad-1"))`, "fp-1");
    expect(edA.store["pad-1"]!.body).toEqual(
      sexprToItems(`(pad "1" smd (at 7 7) (uuid "pad-1"))`, "fp-1").items["pad-1"]!.body,
    );

    // A adds a free segment → B gets it.
    edA.localUpsert(`(segment (start 0 0) (end 1 1) (uuid "seg-1"))`, null, "added");
    expect(edB.store["seg-1"]).toBeDefined();

    // A removes the footprint → cascades to B's whole subtree.
    edA.localRemove("fp-1");
    expect(Object.keys(edB.store).sort()).toEqual(["seg-1"]);

    // Echo suppression: every applyItems an editor received came from the PEER's
    // edits (adopt + peer changes), never from its own emits bouncing back.
    for (const json of edA.applied) {
      const wire = parseItemsWireDelta(json);
      // A's own edits were seg-1 add + fp-1 remove; they must not appear.
      expect(wire.added.map((w) => w.sexpr).join()).not.toContain("seg-1");
      expect(wire.removed).not.toContain("fp-1");
    }
  });

  it("a remote apply does not bounce back to the originator", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed();
    bindB.seed();
    const appliedOnB = edB.applied.length;

    edB.localUpsert(`(pad "1" smd (at 3 3) (uuid "pad-1"))`, "fp-1");
    // B's own edit: nothing new applied on B (only A receives an apply).
    expect(edB.applied.length).toBe(appliedOnB);
    expect(edA.applied.length).toBeGreaterThan(0);
  });

  it("adopt removes divergent local-only roots (doc authority)", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed();

    // B cold-opened the same file unsaved → its local model has a DIFFERENT uuid.
    seedEditor(edB, `(footprint "lib:R" (layer "F.Cu") (uuid "fp-DIVERGENT") (at 10 10))`);
    bindB.seed();

    expect(edB.store["fp-DIVERGENT"]).toBeUndefined(); // dropped
    expect(edB.store["fp-1"]).toBeDefined(); // adopted
  });

  it("seed(seedDoc) writes the FULL doc — file recoverable from the Y.Doc; peer adopts", () => {
    const { a, edA, edB, bindA, bindB } = setup();
    const file = `(kicad_wks (version 20220228) (generator "pl_editor")
  (setup (textsize 1.5 1.5) (linewidth 0.15))
  (rect (uuid "r-1") (name "border") (start 0 0 ltcorner) (end 0 0 rbcorner))
)
`;
    const seedDoc = fileToDoc(file);
    // Editor A opened the same file: its model holds the same flattened items.
    Object.assign(edA.store, seedDoc.items);

    bindA.seed(seedDoc); // empty room → file-seeds meta + layout + items
    bindB.seed(); // joins → adopts

    // The peer's editor received the items via adopt.
    expect(edB.store["r-1"]).toBeDefined();
    // Lossless: the file is recoverable from the Y.Doc ALONE (ysync 0005/0007),
    // which the editor-snapshot seed (items only, no layout/meta) cannot do.
    expect(docToFile(yToDoc(a))).toBe(docToFile(seedDoc));
    // The file-seed must not have echoed an apply into the seeding editor.
    expect(edA.applied.length).toBe(0);
  });

  it("seed(seedDoc) on a populated room still ADOPTS (doc authority wins over the file)", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed(); // A seeds the room from its editor

    // B cold-opens a divergent copy of the file and offers it as seedDoc.
    const fileB = `(kicad_wks (version 20220228)
  (rect (uuid "fp-DIVERGENT") (name "border"))
)
`;
    const seedDocB = fileToDoc(fileB);
    Object.assign(edB.store, seedDocB.items);
    bindB.seed(seedDocB);

    expect(edB.store["fp-DIVERGENT"]).toBeUndefined(); // dropped
    expect(edB.store["fp-1"]).toBeDefined(); // adopted
  });

  it("pre-seed remote state does NOT stream into the editor (adopt covers it)", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed(); // relays the full state into B's Y.Doc immediately

    // B has NOT seeded yet: the initial state sync must not have been applied
    // item-by-item (in the real app that's a redundant full blob apply into an
    // editor that already opened the file).
    expect(edB.applied.length).toBe(0);

    bindB.seed(); // the adopt delivers the same state, once
    expect(Object.keys(edB.store).sort()).toEqual(["fld-1", "fp-1", "pad-1"]);
  });

  it("seed(editorMatchesDoc) skips the adopt apply but still binds both ways", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed(); // A seeds the room

    // B is the Y.Doc-load path: its editor opened the file materialized from
    // the doc, so its store ALREADY matches — no adopt apply must happen.
    seedEditor(edB, FP);
    bindB.seed(undefined, { editorMatchesDoc: true });
    expect(edB.applied.length).toBe(0);

    // The binding is still live both ways after the apply-less seed.
    edA.localUpsert(`(pad "1" smd (at 5 5) (uuid "pad-1"))`, "fp-1");
    expect(edB.store["pad-1"]!.body).toEqual(
      sexprToItems(`(pad "1" smd (at 5 5) (uuid "pad-1"))`, "fp-1").items["pad-1"]!.body,
    );
    edB.localUpsert(`(pad "1" smd (at 6 6) (uuid "pad-1"))`, "fp-1");
    expect(edA.store["pad-1"]!.body).toEqual(
      sexprToItems(`(pad "1" smd (at 6 6) (uuid "pad-1"))`, "fp-1").items["pad-1"]!.body,
    );
  });

  it("destroy() detaches the editor from further remote changes", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed();
    bindB.seed();

    bindB.destroy();
    edA.localUpsert(`(pad "1" smd (at 9 9) (uuid "pad-1"))`, "fp-1");

    // B's Y.Doc still received the update (provider-level), but its editor didn't.
    expect(edB.store["pad-1"]!.body).toEqual(
      sexprToItems(`(pad "1" smd (at 0 0) (uuid "pad-1"))`, "fp-1").items["pad-1"]!.body,
    );
  });

  it("adopt applies only the DIFFERENCE (opt 13) — identical items cost nothing", () => {
    const { edA, edB, bindA, bindB } = setup();
    const SEG = `(segment (start 0 0) (end 1 1) (uuid "seg-1"))`;
    seedEditor(edA, FP);
    seedEditor(edA, SEG);
    bindA.seed();

    // B's editor already holds the IDENTICAL footprint but not the segment.
    seedEditor(edB, FP);
    bindB.seed();

    expect(edB.store["seg-1"]).toBeDefined(); // caught up
    expect(edB.applied).toHaveLength(1);
    const wire = parseItemsWireDelta(edB.applied[0]!);
    // Only the missing segment travelled — the matching footprint did not.
    expect(wire.added).toHaveLength(1);
    expect(wire.added[0]!.sexpr).toContain("seg-1");
    expect(wire.changed).toHaveLength(0);
    expect(wire.removed).toHaveLength(0);
  });

  it("adopt with a fully matching editor applies NOTHING (clean rebind)", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed();
    seedEditor(edB, FP);
    bindB.seed();
    expect(edB.applied).toHaveLength(0);
  });

  it("adopt re-applies a differing item's DOC version, lifted to its root", () => {
    const { edA, edB, bindA, bindB } = setup();
    seedEditor(edA, FP);
    bindA.seed();

    // B holds the same footprint but its pad drifted (never-synced local state).
    seedEditor(edB, FP.replace(`(pad "1" smd (at 0 0)`, `(pad "1" smd (at 9 9)`));
    bindB.seed();

    // Doc authority: B's editor converges on the doc's pad, via ONE root re-apply.
    expect(edB.store["pad-1"]!.body).toEqual(
      sexprToItems(`(pad "1" smd (at 0 0) (uuid "pad-1"))`, "fp-1").items["pad-1"]!.body,
    );
    expect(edB.applied).toHaveLength(1);
    const wire = parseItemsWireDelta(edB.applied[0]!);
    expect(wire.changed).toHaveLength(1);
    expect(wire.changed[0]!.sexpr).toContain(`(uuid "fp-1")`); // the root, not the bare pad
  });
});

describe("lib_symbols flow through the binding (miss 08A)", () => {
  const DEF = `(symbol "Device:R" (property "Reference" "R" (at 2 0 90)))`;
  const INSTANCE = `(symbol (lib_id "Device:R") (at 100 50 0) (uuid "sym-1"))`;

  it("an emitted placement's definition is stored and re-rendered for the peer", () => {
    const { a, b } = pair();
    const edA = new FakeEditor();
    const edB = new FakeEditor();
    bindKicadCollab(a, edA).seed();
    bindKicadCollab(b, edB).seed();

    // A places a symbol: the eeschema blob is multi-form (definition + instance).
    edA.localUpsert(`(lib_symbols ${DEF}) ${INSTANCE}`, null, "added");

    // B's editor received the instance WITH its definition prefixed (findLib's
    // first branch), even though B has never seen this symbol.
    expect(edB.store["sym-1"]).toBeDefined();
    const applied = edB.applied.map((j) => parseItemsWireDelta(j));
    const symWire = applied
      .flatMap((w) => [...w.added, ...w.changed])
      .find((w) => w.sexpr.includes("sym-1"));
    expect(symWire, "the symbol reached B").toBeTruthy();
    expect(symWire!.sexpr).toMatch(/^\(lib_symbols \(symbol "Device:R"/);

    // And the definition landed in the room's defs map on BOTH sides
    // (materialization injection is covered by the shared-lib tests — this
    // room was editor-snapshot-seeded, which carries no layout/meta).
    expect(kicadLibSymbolsMap(b).get("Device:R")).toContain(`"Device:R"`);
    expect(kicadLibSymbolsMap(a).get("Device:R")).toContain(`"Device:R"`);
  });

  it("adopt of a doc holding a symbol carries the definition too", () => {
    const { a, b } = pair();
    const edA = new FakeEditor();
    const edB = new FakeEditor();
    bindKicadCollab(a, edA).seed();
    edA.localUpsert(`(lib_symbols ${DEF}) ${INSTANCE}`, null, "added");

    // B joins with an empty editor → adopts the doc.
    bindKicadCollab(b, edB).seed();
    expect(edB.store["sym-1"]).toBeDefined();
    const wire = parseItemsWireDelta(edB.applied[0]!);
    const symWire = [...wire.added, ...wire.changed].find((w) => w.sexpr.includes("sym-1"));
    expect(symWire!.sexpr).toMatch(/^\(lib_symbols \(symbol "Device:R"/);
  });
});
