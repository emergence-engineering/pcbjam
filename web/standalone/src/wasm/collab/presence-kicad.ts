import { clog } from "./debug";
import type { PresenceHandle, PresencePeer } from "./presence";

/**
 * Wire the C++ presence bridge (collab-presence 0002) to the awareness layer:
 *
 *   C++ → awareness: `window.kicadCollab.onSelection/onCursor` (this tab's
 *   selection uuids + world-coord cursor, emitted by the wasm input hooks)
 *   publish into the room via the presence handle's setters.
 *
 *   awareness → C++: on every peers change, push a full remote snapshot to
 *   `Module.kicadCollabSetRemote` — the wasm side clears + redraws its
 *   VIEW_OVERLAY from it (idempotent), so no delta bookkeeping is needed.
 *   Pushes are trailing-throttled: N peers × 20 cursor updates/s must not
 *   cross the JS↔wasm boundary per event.
 *
 *   `onViewport` (world↔screen transform) feeds an optional callback for the
 *   DOM layers (comment pins, 0005); the roster doesn't need it.
 */

export interface PresenceKicadModule {
  kicadCollabPresenceStart(): void;
  kicadCollabSetRemote(json: string): void;
  kicadCollabGetViewport(): string;
  kicadCollabGetSelection(): string;
}

export interface PresenceKicadWindow {
  kicadCollab?: {
    onSelection?: (uuidsJson: string) => void;
    onCursor?: (x: number, y: number, active: number) => void;
    onViewport?: (cx: number, cy: number, scale: number, w: number, h: number) => void;
  };
}

/** The GAL viewport transform: world center (IU), pixels-per-IU scale, px size. */
export interface ViewportState {
  cx: number;
  cy: number;
  scale: number;
  w: number;
  h: number;
}

/** True when the loaded wasm exposes the presence bridge (0002 exports). */
export function hasPresenceBridge(mod: unknown): mod is PresenceKicadModule {
  const m = mod as Partial<PresenceKicadModule> | undefined;
  return (
    typeof m?.kicadCollabPresenceStart === "function" &&
    typeof m?.kicadCollabSetRemote === "function"
  );
}

const PUSH_THROTTLE_MS = 30;

export function bindKicadPresence(opts: {
  mod: PresenceKicadModule;
  win: PresenceKicadWindow;
  presence: PresenceHandle;
  onViewport?: (vp: ViewportState) => void;
}): { destroy(): void } {
  const { mod, win, presence } = opts;

  // C++ → awareness ------------------------------------------------------------
  win.kicadCollab = {
    ...win.kicadCollab,
    onSelection: (uuidsJson) => {
      try {
        const uuids = JSON.parse(uuidsJson) as string[];
        presence.setSelection(Array.isArray(uuids) ? uuids : []);
      } catch {
        /* malformed emit — keep the last published selection */
      }
    },
    onCursor: (x, y, active) => {
      presence.setCursor(active ? { x, y } : null);
    },
    onViewport: (cx, cy, scale, w, h) => {
      opts.onViewport?.({ cx, cy, scale, w, h });
    },
  };

  // Seed: the tab may attach with a selection already made (e.g. rebind).
  try {
    const seed = JSON.parse(mod.kicadCollabGetSelection() || "[]") as string[];
    if (Array.isArray(seed) && seed.length) presence.setSelection(seed);
  } catch {
    /* bridge present but frame not up yet — the first emit will seed */
  }

  // awareness → C++ ------------------------------------------------------------
  const pushRemote = () => {
    const peers = presence.peers();
    const snapshot = {
      peers: peers.map((p: PresencePeer) => ({
        id: p.user.id,
        name: p.user.name,
        color: p.user.color,
        cursor: p.cursor,
        selection: p.selection,
      })),
    };
    mod.kicadCollabSetRemote(JSON.stringify(snapshot));
  };

  let pushTimer: ReturnType<typeof setTimeout> | undefined;
  const schedulePush = () => {
    if (pushTimer) return;
    pushTimer = setTimeout(() => {
      pushTimer = undefined;
      pushRemote();
    }, PUSH_THROTTLE_MS);
  };

  const unsubscribe = presence.subscribe(schedulePush);

  mod.kicadCollabPresenceStart();
  pushRemote();
  clog("presence-kicad: bridge bound (cursor/selection emit + remote overlay)");

  return {
    destroy() {
      unsubscribe();
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = undefined;
      if (win.kicadCollab) {
        delete win.kicadCollab.onSelection;
        delete win.kicadCollab.onCursor;
        delete win.kicadCollab.onViewport;
      }
      // Clear the remote overlay so a dead session leaves no ghost cursors.
      try {
        mod.kicadCollabSetRemote(JSON.stringify({ peers: [] }));
      } catch {
        /* wasm may already be gone on page teardown */
      }
    },
  };
}
