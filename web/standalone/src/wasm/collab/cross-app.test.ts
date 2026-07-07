import { afterEach, describe, expect, it } from "vitest";
import { colorForUser, type PresenceUser } from "@pcbjam/shared";
import { resetPresenceColorClaims } from "./presence";
import { startCrossAppPresence, type CrossAppHandle } from "./cross-app";

/**
 * Cross-app presence room unit tests (collab-presence 0006): real handles on
 * the BroadcastChannel provider (node ≥18 has BroadcastChannel globally) stand
 * in for an eeschema tab and a pcbnew tab of the same project.
 */

const settle = () => new Promise((r) => setTimeout(r, 60));

function user(id: string): PresenceUser {
  return { id, name: id, color: colorForUser(id) };
}

let handles: CrossAppHandle[] = [];
let projectSeq = 0;

async function join(projectId: string, userId: string, tool: string): Promise<CrossAppHandle> {
  const h = await startCrossAppPresence({
    projectId,
    provider: { kind: "broadcastchannel", settleMs: 10 },
    user: user(userId),
    tool,
  });
  if (!h) throw new Error("cross-app handle expected on the BC provider");
  handles.push(h);
  return h;
}

afterEach(async () => {
  for (const h of handles) h.destroy();
  handles = [];
  resetPresenceColorClaims();
  // Drain already-queued BroadcastChannel deliveries before vitest recycles
  // the module registry — a late message otherwise trips the vite-node module
  // proxy (flaky unhandled RangeError at the schema getter).
  await new Promise((r) => setTimeout(r, 20));
});

describe("startCrossAppPresence", () => {
  it("returns undefined for the none provider", async () => {
    const h = await startCrossAppPresence({
      projectId: "P",
      provider: { kind: "none" },
      user: user("alice"),
      tool: "pcbnew",
    });
    expect(h).toBeUndefined();
  });

  it("peers see only OTHER-tool clients, including the own user's other tab", async () => {
    const project = `xapp-${projectSeq++}`;
    const sch = await join(project, "alice", "eeschema");
    const pcb = await join(project, "alice", "pcbnew"); // same user, other tool
    const pcb2 = await join(project, "bob", "pcbnew");
    await settle();

    // The eeschema tab sees both pcbnew tabs (own user's included).
    const schPeers = sch.peers();
    expect(schPeers.map((p) => p.state.user.id).sort()).toEqual(["alice", "bob"]);
    expect(schPeers.every((p) => p.state.tool === "pcbnew")).toBe(true);

    // A pcbnew tab sees only the eeschema tab — the other pcbnew tab is
    // same-tool (per-file rooms own that relationship).
    expect(pcb.peers().map((p) => p.state.user.id)).toEqual(["alice"]);
    expect(pcb2.peers().map((p) => p.state.user.id)).toEqual(["alice"]);
  });

  it("propagates selection + selectionPaths and clears on destroy", async () => {
    const project = `xapp-${projectSeq++}`;
    const sch = await join(project, "alice", "eeschema");
    const pcb = await join(project, "bob", "pcbnew");
    await settle();

    pcb.setSelection(["fp-uuid"], ["/sheet/sym-1"]);
    await settle();
    const seen = sch.peers().find((p) => p.state.user.id === "bob");
    expect(seen?.state.selection).toEqual(["fp-uuid"]);
    expect(seen?.state.selectionPaths).toEqual(["/sheet/sym-1"]);

    // Clearing the paths drops the optional field from the published state.
    pcb.setSelection([], undefined);
    await settle();
    const cleared = sch.peers().find((p) => p.state.user.id === "bob");
    expect(cleared?.state.selection).toEqual([]);
    expect(cleared?.state.selectionPaths).toBeUndefined();

    pcb.destroy();
    await settle();
    expect(sch.peers()).toEqual([]);
  });

  it("different projects do not share the presence room", async () => {
    const a = await join(`xapp-${projectSeq++}`, "alice", "eeschema");
    await join(`xapp-${projectSeq++}`, "bob", "pcbnew");
    await settle();
    expect(a.peers()).toEqual([]);
  });

  it("notifies subscribers on peer changes", async () => {
    const project = `xapp-${projectSeq++}`;
    const sch = await join(project, "alice", "eeschema");
    let fired = 0;
    sch.subscribe(() => fired++);
    await join(project, "bob", "pcbnew");
    await settle();
    expect(fired).toBeGreaterThan(0);
  });
});
