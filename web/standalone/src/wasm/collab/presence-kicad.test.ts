import { describe, expect, it, vi } from "vitest";
import { colorForUser } from "@pcbjam/shared";
import { bindKicadPresence, hasPresenceBridge, type PresenceKicadWindow } from "./presence-kicad";
import type { PresenceHandle, PresencePeer } from "./presence";

/**
 * presence-kicad bridge unit tests (collab-presence 0002): a fake Module +
 * window stand in for the wasm side; a stub presence handle stands in for
 * awareness. Verifies both directions and teardown.
 */

function fakeModule() {
  return {
    kicadCollabPresenceStart: vi.fn(),
    kicadCollabSetRemote: vi.fn(),
    kicadCollabGetViewport: vi.fn(() => '{"cx":0,"cy":0,"scale":1,"w":800,"h":600}'),
    kicadCollabGetSelection: vi.fn(() => "[]"),
  };
}

function stubPresence(peers: PresencePeer[] = []) {
  const subscribers = new Set<(p: PresencePeer[]) => void>();
  const handle: PresenceHandle & { firePeers(p: PresencePeer[]): void } = {
    peers: () => peers,
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    setCursor: vi.fn(),
    setSelection: vi.fn(),
    destroy: vi.fn(),
    firePeers(p) {
      peers = p;
      for (const cb of subscribers) cb(p);
    },
  };
  return handle;
}

function peer(id: string, over: Partial<PresencePeer> = {}): PresencePeer {
  return {
    clientId: 1,
    user: { id, name: id, color: colorForUser(id) },
    tool: "pcbnew",
    cursor: null,
    selection: [],
    updatedAt: 1,
    ...over,
  };
}

describe("bindKicadPresence", () => {
  it("routes C++ emits into the presence setters", () => {
    const mod = fakeModule();
    const win: PresenceKicadWindow = {};
    const presence = stubPresence();
    bindKicadPresence({ mod, win, presence });

    expect(mod.kicadCollabPresenceStart).toHaveBeenCalled();

    win.kicadCollab!.onSelection!('["uuid-1","uuid-2"]');
    expect(presence.setSelection).toHaveBeenCalledWith(["uuid-1", "uuid-2"]);

    win.kicadCollab!.onCursor!(5, 7, 1);
    expect(presence.setCursor).toHaveBeenCalledWith({ x: 5, y: 7 });
    win.kicadCollab!.onCursor!(0, 0, 0);
    expect(presence.setCursor).toHaveBeenCalledWith(null);
  });

  it("seeds an existing selection from the wasm at attach", () => {
    const mod = fakeModule();
    mod.kicadCollabGetSelection.mockReturnValue('["pre-selected"]');
    const presence = stubPresence();
    bindKicadPresence({ mod, win: {}, presence });
    expect(presence.setSelection).toHaveBeenCalledWith(["pre-selected"]);
  });

  it("pushes a throttled remote snapshot on peers change", async () => {
    const mod = fakeModule();
    const presence = stubPresence();
    bindKicadPresence({ mod, win: {}, presence });
    expect(mod.kicadCollabSetRemote).toHaveBeenCalledTimes(1); // initial push

    presence.firePeers([
      peer("bob", { cursor: { x: 10, y: 20 }, selection: ["u1"] }),
    ]);
    presence.firePeers([
      peer("bob", { cursor: { x: 11, y: 21 }, selection: ["u1"] }),
    ]);
    await new Promise((r) => setTimeout(r, 60));

    // Two rapid changes coalesce into ONE trailing push carrying the latest state.
    expect(mod.kicadCollabSetRemote).toHaveBeenCalledTimes(2);
    const snapshot = JSON.parse(mod.kicadCollabSetRemote.mock.calls.at(-1)![0]);
    expect(snapshot.peers).toEqual([
      {
        id: "bob",
        name: "bob",
        color: colorForUser("bob"),
        cursor: { x: 11, y: 21 },
        selection: ["u1"],
      },
    ]);
  });

  it("destroy unhooks the window and clears the remote overlay", () => {
    const mod = fakeModule();
    const win: PresenceKicadWindow = {};
    const presence = stubPresence();
    const binding = bindKicadPresence({ mod, win, presence });

    binding.destroy();
    expect(win.kicadCollab?.onSelection).toBeUndefined();
    expect(win.kicadCollab?.onCursor).toBeUndefined();
    const last = JSON.parse(mod.kicadCollabSetRemote.mock.calls.at(-1)![0]);
    expect(last.peers).toEqual([]);
  });

  it("hasPresenceBridge gates on the 0002 exports", () => {
    expect(hasPresenceBridge(fakeModule())).toBe(true);
    expect(hasPresenceBridge({})).toBe(false);
    expect(hasPresenceBridge(undefined)).toBe(false);
  });
});
