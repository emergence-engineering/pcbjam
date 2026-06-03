import * as Y from "yjs";
import { clog } from "./debug";

/**
 * Minimal BroadcastChannel sync provider for a Y.Doc (features/yjs-bridge/0001 §6,
 * PoC transport — two same-origin tabs share one doc, zero backend). Encodes Yjs
 * updates and ferries them between tabs; on join it requests the current state so a
 * late tab catches up.
 *
 * Remote updates are applied with origin "remote" so (a) the reconciler treats them
 * as peer changes (its own writes use a different origin) and (b) we don't re-broadcast
 * them into a loop.
 */
export interface Transport {
  destroy(): void;
}

type Msg =
  | { t: "update"; u: Uint8Array }
  | { t: "query" }
  | { t: "state"; u: Uint8Array };

export const REMOTE_ORIGIN = "remote";

export function connectBroadcastChannel(
  doc: Y.Doc,
  channelName: string,
): Transport {
  const bc = new BroadcastChannel(channelName);
  clog("BroadcastChannel open:", channelName);

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE_ORIGIN) return; // don't echo applied remote updates
    clog("→ BC send update", update.byteLength, "bytes (origin:", String(origin) + ")");
    bc.postMessage({ t: "update", u: update } satisfies Msg);
  };
  doc.on("update", onUpdate);

  bc.onmessage = (e: MessageEvent<Msg>) => {
    const msg = e.data;
    if (!msg) return;
    switch (msg.t) {
      case "update":
      case "state":
        clog("← BC recv", msg.t, msg.u?.byteLength, "bytes → applyUpdate");
        Y.applyUpdate(doc, new Uint8Array(msg.u), REMOTE_ORIGIN);
        break;
      case "query":
        clog("← BC recv query → replying with state");
        bc.postMessage({ t: "state", u: Y.encodeStateAsUpdate(doc) } satisfies Msg);
        break;
    }
  };

  // Ask any existing tab for the current state.
  clog("→ BC send query (asking peers for state)");
  bc.postMessage({ t: "query" } satisfies Msg);

  return {
    destroy: () => {
      doc.off("update", onUpdate);
      bc.close();
    },
  };
}
