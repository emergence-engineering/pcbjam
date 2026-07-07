import type { Awareness } from "y-protocols/awareness";
import {
  colorForUser,
  PRESENCE_COLORS,
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
  /**
   * Every OTHER awareness client in the room, validated but NOT deduped by
   * user — the same user's other tab is its own entry. Soft-locks (0007) key
   * on clients, not users: your own second tab must lock against you too.
   */
  clients(): PresencePeer[];
  /** This client's identity for tiebreaks: (user.id, awareness clientID). */
  self(): { userId: string; clientId: number };
  /** Fires with the new roster on every awareness change. Returns unsubscribe. */
  subscribe(cb: (peers: PresencePeer[]) => void): () => void;
  /** 0002: publish the local pointer's world position (null = off canvas). */
  setCursor(pos: { x: number; y: number } | null): void;
  /** 0002: publish the local selection's KIID strings. */
  setSelection(uuids: string[]): void;
  /** A user's current presence color: their published one if they're in the
   *  room, our claimed one for ourselves, else the palette-hash fallback
   *  (offline users, e.g. old comment authors). */
  colorOf(userId: string): string;
  /** Clear the local state and detach. The awareness instance itself belongs
   *  to the provider and stays alive (rebind re-uses it). */
  destroy(): void;
}

// ── nth-in-room color assignment ─────────────────────────────────────────────
//
// Colors are claimed by ARRIVAL ORDER, not name hash: each client takes the
// lowest palette index no other peer holds, so N ≤ palette-size editors always
// get distinct colors (a hash would collide birthday-problem-fast) and the
// best palette colors go first. Coordination-free: the claim is published in
// the awareness state; when two simultaneous joiners collide, the one with the
// HIGHER awareness clientID yields and re-claims (deterministic convergence).
// The claim is per-tab and sticky across room rebinds (eeschema sheet pool),
// so one user keeps one color everywhere in a session; a second tab of the
// same user ADOPTS the existing color instead of claiming a new one.

// Per-user claims in this JS context (one user per tab in production; the
// map keeps multi-client unit tests deterministic).
const g_claims = new Map<string, string>();

/** Test hook: forget all color claims. */
export function resetPresenceColorClaims(): void {
  g_claims.clear();
}

/** The session's claimed color for a user, if any — sibling rooms (skeletons,
 *  the 0006 project presence room) reuse it so one user is one color everywhere. */
export function claimedPresenceColor(userId: string): string | undefined {
  return g_claims.get(userId);
}

/** Least-used palette color among the OTHER users in `states` — the lowest
 *  free slot while the room is smaller than the palette, fair reuse after. */
function lowestFreeColor(
  states: Map<number, unknown>,
  ownClientId: number,
  ownUserId: string,
): string {
  const usage = new Array(PRESENCE_COLORS.length).fill(0);

  for (const [clientId, state] of states) {
    if (clientId === ownClientId) continue;
    const parsed = presenceStateSchema.safeParse(state);
    if (!parsed.success || parsed.data.user.id === ownUserId) continue;
    const idx = (PRESENCE_COLORS as readonly string[]).indexOf(parsed.data.user.color);
    if (idx >= 0) usage[idx]++;
  }

  const min = Math.min(...usage);
  return PRESENCE_COLORS[usage.indexOf(min)]!;
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
    // Skeletons reuse the claimed color so one user is one color on every
    // sheet's roster.
    user: { ...user, color: g_claims.get(user.id) ?? user.color },
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
  const { awareness } = opts;

  // Nth-in-room color: adopt a same-user tab's color, else keep an earlier
  // claim (sticky across sheet rebinds), else claim the lowest free palette
  // slot given the peers already in the room.
  let claimed = g_claims.get(opts.user.id) ?? null;
  if (!claimed) {
    for (const [clientId, raw] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue;
      const parsed = presenceStateSchema.safeParse(raw);
      if (parsed.success && parsed.data.user.id === opts.user.id) {
        claimed = parsed.data.user.color;
        break;
      }
    }
  }
  if (!claimed) {
    claimed = lowestFreeColor(awareness.getStates(), awareness.clientID, opts.user.id);
  }
  g_claims.set(opts.user.id, claimed);

  const user: PresenceUser = { ...opts.user, color: claimed };

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
  clog("presence: published local state for", user.id, "color", user.color);

  // Simultaneous-join collision: if a DIFFERENT user with a LOWER clientID
  // holds our color, we yield and re-claim the lowest free slot — exactly one
  // side of any collision yields, so this converges without coordination.
  // Same-user tabs converge the other way: adopt the lower clientID's color.
  //
  // Re-entrancy guard: patch() fires the awareness 'change' event
  // SYNCHRONOUSLY on the local instance, which re-enters this resolver — with
  // two stale conflicting states in view (e.g. mid-propagation same-user
  // tabs) the adopt/re-claim branches can ping-pong until the stack blows.
  // Patches made HERE don't need immediate re-resolution; the next genuine
  // (async) awareness delivery re-runs the resolver with fresher states.
  let resolvingCollision = false;
  const resolveCollision = () => {
    if (resolvingCollision) return;
    resolvingCollision = true;
    try {
      resolveCollisionOnce();
    } finally {
      resolvingCollision = false;
    }
  };
  const resolveCollisionOnce = () => {
    for (const [clientId, raw] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue;
      const parsed = presenceStateSchema.safeParse(raw);
      if (!parsed.success) continue;

      if (parsed.data.user.id === user.id) {
        if (parsed.data.user.color !== user.color && clientId < awareness.clientID) {
          user.color = parsed.data.user.color;
          g_claims.set(user.id, user.color);
          patch({ user: { ...user } });
          clog("presence: adopted same-user color", user.color);
          return;
        }
        continue;
      }

      if (parsed.data.user.color === user.color && clientId < awareness.clientID) {
        user.color = lowestFreeColor(awareness.getStates(), awareness.clientID, user.id);
        g_claims.set(user.id, user.color);
        patch({ user: { ...user } });
        clog("presence: color collision — re-claimed", user.color);
        return;
      }
    }
  };

  function clients(): PresencePeer[] {
    const out: PresencePeer[] = [];
    for (const [clientId, raw] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue;
      const parsed = presenceStateSchema.safeParse(raw);
      if (!parsed.success) continue;
      out.push({ ...parsed.data, clientId });
    }
    return out.sort((a, b) => a.clientId - b.clientId);
  }

  function peers(): PresencePeer[] {
    const byUser = new Map<string, PresencePeer>();
    for (const peer of clients()) {
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
    resolveCollision();
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
    clients,
    self() {
      return { userId: user.id, clientId: awareness.clientID };
    },
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
    colorOf(userId) {
      if (userId === user.id) return user.color;
      for (const [clientId, raw] of awareness.getStates()) {
        if (clientId === awareness.clientID) continue;
        const parsed = presenceStateSchema.safeParse(raw);
        if (parsed.success && parsed.data.user.id === userId) {
          return parsed.data.user.color;
        }
      }
      return colorForUser(userId);
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
