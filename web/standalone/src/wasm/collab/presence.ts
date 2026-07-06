import type { Awareness } from "y-protocols/awareness";
import {
  presenceStateSchema,
  type PresenceState,
  type PresenceUser,
} from "@pcbjam/shared";
import { clog } from "./debug";

/**
 * Room presence over Yjs awareness (collab-presence 0001): publish this
 * client's `PresenceState` into the room and expose the peers' states as a
 * subscribable roster. Ephemeral by design — the provider relays awareness,
 * nothing is persisted, and peers expire a silent client automatically.
 *
 * One handle per bound room. eeschema rebinds on sheet navigation (the sheet
 * manager tears this down and creates one on the new room), so a peer's
 * roster always reflects the room they'd collide with.
 */

/** A peer's validated presence state plus its awareness clientID. */
export interface PresencePeer extends PresenceState {
  clientId: number;
}

export interface PresenceHandle {
  /**
   * The OTHER users in the room: own client excluded, entries that fail the
   * wire schema dropped (older builds), and one entry per `user.id` (the same
   * user in two tabs is one person — keep the freshest state).
   */
  peers(): PresencePeer[];
  /** Fires with the new roster on every awareness change. Returns unsubscribe. */
  subscribe(cb: (peers: PresencePeer[]) => void): () => void;
  /** 0002: publish the local pointer's world position (null = off canvas). */
  setCursor(pos: { x: number; y: number } | null): void;
  /** 0002: publish the local selection's KIID strings. */
  setSelection(uuids: string[]): void;
  /** Clear the local state and detach. The awareness instance itself belongs
   *  to the provider and stays alive (rebind re-uses it). */
  destroy(): void;
}

/**
 * Publish a SKELETON presence state into a room the user is connected to but
 * not looking at (eeschema warm pool, collab-presence 0003): identity + which
 * sheet they are actually on, no cursor/selection. Any sheet's roster can then
 * answer "who is in this schematic, and where". The bound room's full state is
 * owned by `createPresence` (which overwrites the skeleton on rebind).
 */
export function publishSkeleton(
  awareness: Awareness,
  user: PresenceUser,
  tool: string,
  sheetPath: string,
): void {
  const state: PresenceState = {
    user,
    tool,
    sheetPath,
    cursor: null,
    selection: [],
    updatedAt: Date.now(),
  };
  awareness.setLocalState(state);
}

export function createPresence(opts: {
  awareness: Awareness;
  user: PresenceUser;
  tool: string;
  sheetPath?: string;
}): PresenceHandle {
  const { awareness, user } = opts;

  const patch = (fields: Partial<PresenceState>) => {
    const current = (awareness.getLocalState() ?? {}) as Partial<PresenceState>;
    awareness.setLocalState({ ...current, ...fields, updatedAt: Date.now() });
  };

  patch({
    user,
    tool: opts.tool,
    ...(opts.sheetPath !== undefined ? { sheetPath: opts.sheetPath } : {}),
    cursor: null,
    selection: [],
  });
  clog("presence: published local state for", user.id, "tool", opts.tool);

  function peers(): PresencePeer[] {
    const byUser = new Map<string, PresencePeer>();
    for (const [clientId, raw] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue;
      const parsed = presenceStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      const peer: PresencePeer = { ...parsed.data, clientId };
      // Another tab of the SAME user isn't a peer — the roster shows other people.
      if (peer.user.id === user.id) continue;
      const existing = byUser.get(peer.user.id);
      if (!existing || peer.updatedAt > existing.updatedAt) {
        byUser.set(peer.user.id, peer);
      }
    }
    return [...byUser.values()].sort((a, b) => a.user.id.localeCompare(b.user.id));
  }

  const subscribers = new Set<(peers: PresencePeer[]) => void>();
  const onChange = () => {
    if (!subscribers.size) return;
    const snapshot = peers();
    for (const cb of subscribers) cb(snapshot);
  };
  awareness.on("change", onChange);

  // Best-effort fast removal on tab close/navigation: broadcasting the null
  // state lets peers drop us immediately instead of waiting out the awareness
  // timeout. Guarded — unit tests run in node.
  const onPageHide = () => awareness.setLocalState(null);
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", onPageHide);
  }

  let destroyed = false;
  return {
    peers,
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    setCursor(pos) {
      patch({ cursor: pos });
    },
    setSelection(uuids) {
      patch({ selection: uuids });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", onPageHide);
      }
      awareness.off("change", onChange);
      subscribers.clear();
      awareness.setLocalState(null);
    },
  };
}
