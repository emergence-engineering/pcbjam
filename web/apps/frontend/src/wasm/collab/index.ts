import * as Y from "yjs";
import { connectBroadcastChannel, type Transport } from "./broadcast-transport";
import { clog } from "./debug";
import { createReconciler, type Reconciler } from "./reconciler";
import type { CollabBridge } from "./types";

export type { CollabBridge, CollabDelta, CollabItem } from "./types";
export { createReconciler } from "./reconciler";
export { connectBroadcastChannel } from "./broadcast-transport";

/** The subset of the Emscripten Module the collab bridge needs (embind functions). */
export interface CollabModule {
  kicadCollabSnapshot(): string;
  kicadCollabApply(deltaJson: string): void;
}

/** The window slot the C++ emit side calls into. */
export interface CollabWindow {
  kicadCollab?: { onDelta: (deltaJson: string) => void };
}

export function moduleBridge(mod: CollabModule, win: CollabWindow): CollabBridge {
  return {
    snapshot: () => mod.kicadCollabSnapshot(),
    apply: (deltaJson) => mod.kicadCollabApply(deltaJson),
    onDelta: (cb) => {
      win.kicadCollab = { onDelta: cb };
      clog("registered window.kicadCollab.onDelta (wasm emit sink)");
    },
  };
}

export interface StartCollabOptions {
  /** BroadcastChannel name — tabs sharing this name share the document. */
  channel: string;
  /**
   * How long to wait for an existing tab's state before deciding seed-vs-adopt
   * (seed-once rule). First tab: no reply, seeds from its local model. Later tab:
   * receives state within this window, then adopts it. Default 300ms.
   */
  settleMs?: number;
}

export interface CollabHandle {
  doc: Y.Doc;
  reconciler: Reconciler;
  transport: Transport;
  destroy(): void;
}

/**
 * Wire a running pl_editor wasm Module into a collaborative session: Module ⇄ Y.Doc ⇄
 * BroadcastChannel. Returns once the initial seed/adopt has run. The editor must
 * already have its document loaded (so kicadCollabSnapshot reflects it).
 */
export async function startCollab(
  mod: CollabModule,
  win: CollabWindow,
  opts: StartCollabOptions,
): Promise<CollabHandle> {
  clog("startCollab: channel =", opts.channel);
  const doc = new Y.Doc();
  const bridge = moduleBridge(mod, win);
  const reconciler = createReconciler(doc, bridge);
  const transport = connectBroadcastChannel(doc, opts.channel);

  // Let any existing tab answer our state query before we decide to seed.
  await new Promise((r) => setTimeout(r, opts.settleMs ?? 300));
  reconciler.seed();
  clog("startCollab: ready; doc items =", reconciler.items.size);

  return {
    doc,
    reconciler,
    transport,
    destroy() {
      reconciler.destroy();
      transport.destroy();
      doc.destroy();
    },
  };
}
