import * as Y from "yjs";
import { clog } from "./debug";
import {
  connectProvider,
  type ProviderConfig,
  type YjsProvider,
} from "./provider";
import { createReconciler, type Reconciler } from "./reconciler";
import type { CollabBridge } from "./types";

export type { CollabBridge, CollabDelta, CollabItem } from "./types";
export { createReconciler } from "./reconciler";
export { connectBroadcastChannel } from "./broadcast-transport";
export {
  connectProvider,
  type ProviderConfig,
  type ProviderKind,
  type YjsProvider,
} from "./provider";

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
  /** Which Yjs provider to use + its endpoint/params (env-selected upstream). */
  provider: ProviderConfig;
  /** Room id — see @pcbjam/shared `collabRoomId`. Identifies one shared doc. */
  room: string;
}

export interface CollabHandle {
  doc: Y.Doc;
  reconciler: Reconciler;
  provider: YjsProvider;
  destroy(): void;
}

/**
 * Wire a running KiCad wasm Module into a collaborative session:
 * Module ⇄ Y.Doc ⇄ provider. Returns once the initial seed/adopt has run. The
 * editor must already have its document loaded (so kicadCollabSnapshot reflects
 * it), so that — if this is the first/only client — `seed()` captures it.
 *
 * Seed-vs-adopt: after `provider.whenSynced()` the Y.Doc holds the authoritative
 * state (the server's, a peer tab's, or — first ever — empty). `seed()` then
 * seeds from the local model if the doc is empty, else adopts the shared doc.
 */
export async function startCollab(
  mod: CollabModule,
  win: CollabWindow,
  opts: StartCollabOptions,
): Promise<CollabHandle> {
  clog("startCollab:", opts.provider.kind, "room =", opts.room);
  const doc = new Y.Doc();
  const bridge = moduleBridge(mod, win);
  const reconciler = createReconciler(doc, bridge);
  const provider = await connectProvider(doc, opts.provider, { room: opts.room });

  await provider.whenSynced();
  reconciler.seed();
  clog("startCollab: ready; doc items =", reconciler.items.size);

  return {
    doc,
    reconciler,
    provider,
    destroy() {
      reconciler.destroy();
      provider.destroy();
      doc.destroy();
    },
  };
}
