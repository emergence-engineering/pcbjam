import * as Y from "yjs";
import {
  applyDeltaToY,
  deltaFromYEvents,
  deltaToItemsWire,
  isEmptyItemsWireDelta,
  isEmptyKicadDelta,
  itemsWireToDelta,
  kicadItemsMap,
  parseItemsWireDelta,
  renderItem,
  yToItem,
  type ItemsWireDelta,
  type KicadItem,
  type KicadYItems,
} from "@pcbjam/shared";
import { clog, cwarn } from "./debug";

/**
 * The Slot-model collab binding (ysync 0008 Stage B) — the THIN RUNTIME over the
 * shared, transport-unaware building blocks. This module owns exactly what
 * `@pcbjam/shared` must not: the `observeDeep` subscription, the local-origin
 * echo policy, and seed-once authority. Everything data-shaped — wire schemas,
 * wire⇄delta conversion, Y reads/writes — is the shared lib.
 *
 *   DOWN (editor → Y): bridge.onItems(json) → itemsWireToDelta(wire, Y items)
 *                      → applyDeltaToY (transaction tagged with our origin).
 *   UP   (Y → editor): items.observeDeep → skip own origin → deltaFromYEvents
 *                      → deltaToItemsWire (full subtree sexprs) → bridge.applyItems.
 *
 * The bridge speaks the v2 "items" wire: per-item s-expr + parent uuid — the C++
 * exports kicadCollabSnapshotItems / kicadCollabApplyItems / onItems (Stage C).
 * Until those land in the wasm, the binding is exercised by unit tests with a
 * fake editor bridge (kicad-binding.test.ts).
 */

/** The v2 per-item s-expr bridge (Stage C C++ contract), runtime-adapted. */
export interface KicadItemsBridge {
  /** Full current model as an all-`added` ItemsWireDelta JSON. */
  snapshotItems(): string;
  /** Apply a remote ItemsWireDelta JSON (per-item Parse + splice by uuid). */
  applyItems(json: string): void;
  /** Register the local-edit emit hook (Format changed items → JSON). */
  onItems(cb: (json: string) => void): void;
}

export interface KicadBinding {
  /**
   * Seed-once join: if the shared doc holds no items this client seeds it from
   * the editor snapshot; otherwise the editor adopts the doc (doc authority —
   * local-only roots are removed, doc roots applied). Call once after the
   * doc/provider are connected.
   */
  seed(): void;
  destroy(): void;
  /** The underlying kdoc items map (exposed for tests/inspection). */
  readonly items: KicadYItems;
}

export function bindKicadCollab(doc: Y.Doc, bridge: KicadItemsBridge): KicadBinding {
  const items = kicadItemsMap(doc);
  // Opaque per-instance origin tag so we can distinguish our own writes from peers'.
  const ORIGIN = { local: true };

  /** Plain snapshot of the Y items (the `current`/`view` the conversions need). */
  const itemsView = (): Record<string, KicadItem> => {
    const view: Record<string, KicadItem> = {};
    items.forEach((ym, uuid) => {
      view[uuid] = yToItem(ym);
    });
    return view;
  };

  // DOWN: local editor change → Y.Doc
  bridge.onItems((json: string) => {
    let wire: ItemsWireDelta;
    try {
      wire = parseItemsWireDelta(json);
    } catch (err) {
      cwarn("⬇ onItems from wasm: UNPARSEABLE", err, json);
      return;
    }
    const delta = itemsWireToDelta(wire, itemsView());
    if (isEmptyKicadDelta(delta)) return;
    clog("⬇ onItems (local edit):", {
      added: delta.added.length,
      updated: delta.updated.length,
      removed: delta.removed.length,
    });
    applyDeltaToY(doc, delta, ORIGIN);
  });

  // UP: remote Y change → editor. The subscription + origin policy live HERE
  // (the runtime); the event→delta computation is the shared default impl.
  const observer = (events: Y.YEvent<Y.Map<unknown>>[], txn: Y.Transaction) => {
    if (txn.origin === ORIGIN) return; // our own echo — ignore
    const delta = deltaFromYEvents(items, events);
    if (isEmptyKicadDelta(delta)) return;
    const wire = deltaToItemsWire(delta, itemsView());
    if (isEmptyItemsWireDelta(wire)) return;
    clog("⬆ remote Y change → apply to editor:", {
      added: wire.added.length,
      changed: wire.changed.length,
      removed: wire.removed.length,
    });
    bridge.applyItems(JSON.stringify(wire));
  };
  items.observeDeep(observer);

  function seed(): void {
    let wire: ItemsWireDelta;
    try {
      wire = parseItemsWireDelta(bridge.snapshotItems());
    } catch (err) {
      cwarn("seed: snapshotItems unparseable", err);
      return;
    }
    const local = itemsWireToDelta(wire, {});

    clog(
      `seed: doc has ${items.size} item(s), editor has ${local.added.length} →`,
      items.size === 0 ? "SEEDING doc (first tab)" : "ADOPTING doc (joining)",
    );

    if (items.size === 0) {
      // First tab: seed the shared doc from the editor model.
      applyDeltaToY(doc, local, ORIGIN);
      return;
    }

    // Joining a populated doc: the editor adopts it (seed-once authority, same
    // rationale as the scalar reconciler §2 — divergent local uuids from a
    // never-saved cold open must yield to the doc's identity). Apply the doc's
    // ROOT items (their sexprs embed all descendants) and remove local-only roots.
    const view = itemsView();
    const docRoots = Object.entries(view)
      .filter(([, item]) => item.parent === null)
      .map(([uuid]) => ({ sexpr: renderItem({ items: view }, uuid), parent: null }));
    const removed = local.added
      .filter((it) => it.parent === null && !(it.uuid in view))
      .map((it) => it.uuid);
    bridge.applyItems(JSON.stringify({ added: docRoots, changed: [], removed }));
  }

  return {
    seed,
    destroy: () => items.unobserveDeep(observer),
    items,
  };
}

// ── Live wasm adapter ─────────────────────────────────────────────────────────

/** The Stage C Module exports + window hook, as the browser exposes them. */
export interface KicadItemsModule {
  kicadCollabSnapshotItems(): string;
  kicadCollabApplyItems(json: string): void;
}

export interface KicadItemsWindow {
  kicadCollab?: { onItems?: (json: string) => void };
}

/** Adapt a live wasm Module + window to the bridge interface. */
export function moduleItemsBridge(
  mod: KicadItemsModule,
  win: KicadItemsWindow,
): KicadItemsBridge {
  return {
    snapshotItems: () => mod.kicadCollabSnapshotItems(),
    applyItems: (json) => mod.kicadCollabApplyItems(json),
    onItems: (cb) => {
      // Preserve any sibling hooks (e.g. the legacy onDelta) on the global.
      win.kicadCollab = { ...win.kicadCollab, onItems: cb };
    },
  };
}
