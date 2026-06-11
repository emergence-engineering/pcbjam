import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  itemsWireToDelta,
  parseItemsWireDelta,
  renderItem,
  sexprToItems,
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
});
