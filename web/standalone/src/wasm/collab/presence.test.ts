import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { colorForUser, type PresenceUser } from "@pcbjam/shared";
import { connectAwarenessBroadcast } from "./awareness-bc";
import { createPresence, publishSkeleton, type PresenceHandle } from "./presence";

/**
 * Presence unit tests (collab-presence 0001): two Awareness instances relayed
 * over a real BroadcastChannel (node ≥18 has it globally) stand in for two
 * tabs. BC delivery is async — `settle()` lets a posted message round-trip.
 */

const settle = () => new Promise((r) => setTimeout(r, 50));

function user(id: string): PresenceUser {
  return { id, name: id, color: colorForUser(id) };
}

interface Client {
  awareness: Awareness;
  presence?: PresenceHandle;
  destroy(): void;
}

let clients: Client[] = [];
let channelSeq = 0;

function client(channel: string): Client {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const relay = connectAwarenessBroadcast(awareness, channel);
  const c: Client = {
    awareness,
    destroy() {
      this.presence?.destroy();
      relay.destroy();
      awareness.destroy();
      doc.destroy();
    },
  };
  clients.push(c);
  return c;
}

afterEach(() => {
  for (const c of clients) c.destroy();
  clients = [];
});

describe("presence over the BroadcastChannel awareness relay", () => {
  it("peers see each other's state; destroy removes it immediately", async () => {
    const channel = `presence-test-${channelSeq++}`;
    const a = client(channel);
    const b = client(channel);

    a.presence = createPresence({ awareness: a.awareness, user: user("alice"), tool: "pcbnew" });
    b.presence = createPresence({ awareness: b.awareness, user: user("bob"), tool: "pcbnew" });
    await settle();

    expect(a.presence.peers().map((p) => p.user.id)).toEqual(["bob"]);
    expect(b.presence.peers().map((p) => p.user.id)).toEqual(["alice"]);
    expect(a.presence.peers()[0]!.cursor).toBeNull();

    // destroy() nulls the local state → relayed → bob leaves alice's roster
    // without waiting for the awareness timeout.
    b.presence.destroy();
    b.presence = undefined;
    await settle();
    expect(a.presence.peers()).toEqual([]);
  });

  it("a late-joining tab sees existing peers (join query)", async () => {
    const channel = `presence-test-${channelSeq++}`;
    const a = client(channel);
    a.presence = createPresence({ awareness: a.awareness, user: user("alice"), tool: "pcbnew" });
    await settle();

    const b = client(channel);
    b.presence = createPresence({ awareness: b.awareness, user: user("bob"), tool: "pcbnew" });
    await settle();
    expect(b.presence.peers().map((p) => p.user.id)).toEqual(["alice"]);
  });

  it("dedupes the same user across tabs and hides own slug", async () => {
    const channel = `presence-test-${channelSeq++}`;
    const a1 = client(channel);
    const a2 = client(channel);
    const b = client(channel);
    a1.presence = createPresence({ awareness: a1.awareness, user: user("alice"), tool: "pcbnew" });
    a2.presence = createPresence({ awareness: a2.awareness, user: user("alice"), tool: "pcbnew" });
    b.presence = createPresence({ awareness: b.awareness, user: user("bob"), tool: "pcbnew" });
    await settle();

    // bob sees ONE alice (two tabs, one person); alice's tabs don't see each other.
    expect(b.presence.peers().map((p) => p.user.id)).toEqual(["alice"]);
    expect(a1.presence.peers().map((p) => p.user.id)).toEqual(["bob"]);
  });

  it("drops malformed peer states instead of crashing the roster", async () => {
    const channel = `presence-test-${channelSeq++}`;
    const a = client(channel);
    const b = client(channel);
    a.presence = createPresence({ awareness: a.awareness, user: user("alice"), tool: "pcbnew" });
    b.awareness.setLocalState({ some: "legacy-shape" });
    await settle();
    expect(a.presence.peers()).toEqual([]);
  });

  it("skeleton states mark parked-room users with their real sheet (0003)", async () => {
    // Two per-sheet rooms; alice is BOUND to root and PARKED in sub, bob is
    // bound to sub. Bob's roster (sub room) must show alice as being on root,
    // with no cursor/selection.
    const rootCh = `presence-test-${channelSeq++}`;
    const subCh = `presence-test-${channelSeq++}`;
    const aliceRoot = client(rootCh);
    const aliceSub = client(subCh);
    const bobSub = client(subCh);

    aliceRoot.presence = createPresence({
      awareness: aliceRoot.awareness,
      user: user("alice"),
      tool: "eeschema",
      sheetPath: "root.kicad_sch",
    });
    publishSkeleton(aliceSub.awareness, user("alice"), "eeschema", "root.kicad_sch");
    bobSub.presence = createPresence({
      awareness: bobSub.awareness,
      user: user("bob"),
      tool: "eeschema",
      sheetPath: "sub/child.kicad_sch",
    });
    await settle();

    const aliceSeenByBob = bobSub.presence.peers();
    expect(aliceSeenByBob.map((p) => p.user.id)).toEqual(["alice"]);
    expect(aliceSeenByBob[0]!.sheetPath).toBe("root.kicad_sch");
    expect(aliceSeenByBob[0]!.cursor).toBeNull();
    expect(aliceSeenByBob[0]!.selection).toEqual([]);

    // Alice navigates into sub: full presence rebinds there (overwriting the
    // skeleton) — bob now sees her on HIS sheet, cursor live again.
    aliceSub.presence = createPresence({
      awareness: aliceSub.awareness,
      user: user("alice"),
      tool: "eeschema",
      sheetPath: "sub/child.kicad_sch",
    });
    aliceSub.presence.setCursor({ x: 1, y: 2 });
    await settle();

    const after = bobSub.presence.peers();
    expect(after[0]!.sheetPath).toBe("sub/child.kicad_sch");
    expect(after[0]!.cursor).toEqual({ x: 1, y: 2 });
  });

  it("rebind away leaves no ghost cursor in the old room", async () => {
    // Alice bound in room1 with a live cursor; she navigates away: presence
    // destroy + skeleton must leave sheetPath pointing elsewhere, cursor null.
    const ch = `presence-test-${channelSeq++}`;
    const alice = client(ch);
    const bob = client(ch);
    alice.presence = createPresence({
      awareness: alice.awareness,
      user: user("alice"),
      tool: "eeschema",
      sheetPath: "root.kicad_sch",
    });
    alice.presence.setCursor({ x: 9, y: 9 });
    bob.presence = createPresence({
      awareness: bob.awareness,
      user: user("bob"),
      tool: "eeschema",
      sheetPath: "root.kicad_sch",
    });
    await settle();
    expect(bob.presence.peers()[0]!.cursor).toEqual({ x: 9, y: 9 });

    alice.presence.destroy();
    alice.presence = undefined;
    publishSkeleton(alice.awareness, user("alice"), "eeschema", "sub/child.kicad_sch");
    await settle();

    const ghost = bob.presence.peers();
    expect(ghost.map((p) => p.user.id)).toEqual(["alice"]);
    expect(ghost[0]!.cursor).toBeNull();
    expect(ghost[0]!.sheetPath).toBe("sub/child.kicad_sch");
  });

  it("subscribe fires on change and setters keep sibling fields intact", async () => {
    const channel = `presence-test-${channelSeq++}`;
    const a = client(channel);
    const b = client(channel);
    a.presence = createPresence({ awareness: a.awareness, user: user("alice"), tool: "pcbnew" });
    b.presence = createPresence({ awareness: b.awareness, user: user("bob"), tool: "pcbnew" });
    await settle();

    let latest: string[] | null = null;
    const unsub = a.presence.subscribe((peers) => {
      latest = peers.map((p) => `${p.user.id}:${p.selection.join(",")}`);
    });

    b.presence.setSelection(["uuid-1"]);
    b.presence.setCursor({ x: 5, y: 7 });
    await settle();

    expect(latest).toEqual(["bob:uuid-1"]);
    const bob = a.presence.peers()[0]!;
    // setCursor must not have clobbered the selection set just before it.
    expect(bob.selection).toEqual(["uuid-1"]);
    expect(bob.cursor).toEqual({ x: 5, y: 7 });
    expect(bob.user.color).toBe(colorForUser("bob"));
    unsub();
  });
});
