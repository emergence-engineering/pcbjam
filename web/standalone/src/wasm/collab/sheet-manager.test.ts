import { beforeEach, describe, expect, it, vi } from "vitest";

// The manager orchestrates connect/bind lifecycle; mock its collaborators so the test
// exercises ONLY the warm-pool + active-binding-swap logic (no yjs, no wasm bridge).
const { connectKicadDoc, bindKicadCollab, moduleItemsBridge } = vi.hoisted(() => ({
  connectKicadDoc: vi.fn(),
  bindKicadCollab: vi.fn(),
  moduleItemsBridge: vi.fn(),
}));

vi.mock("./index", () => ({ connectKicadDoc }));
vi.mock("./kicad-binding", () => ({ bindKicadCollab, moduleItemsBridge }));
vi.mock("@pcbjam/shared", () => ({ collabRoomId: (p: string, d: string) => `${p}:${d}` }));

import { createSheetCollabManager } from "./sheet-manager";

interface FakeDoc {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  /** Simulate a remote update arriving over the (warm) provider while parked. */
  emitRemote: () => void;
}
interface FakeSession {
  room: string;
  doc: FakeDoc;
  provider: { destroy: ReturnType<typeof vi.fn> };
}
interface FakeBinding {
  seed: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  lastSeedOpts?: unknown;
}

let sessions: FakeSession[];
let bindings: FakeBinding[];

function makeDoc(): FakeDoc {
  const handlers = new Set<() => void>();
  return {
    on: vi.fn((ev: string, cb: () => void) => {
      if (ev === "update") handlers.add(cb);
    }),
    off: vi.fn((_ev: string, cb: () => void) => {
      handlers.delete(cb);
    }),
    destroy: vi.fn(),
    emitRemote: () => handlers.forEach((h) => h()),
  };
}

function makeManager() {
  return createSheetCollabManager({
    mod: {} as never,
    win: {} as never,
    projectId: "P",
    provider: { kind: "none" } as never,
    seedDocForPath: () => undefined,
    log: () => {},
  });
}

beforeEach(() => {
  sessions = [];
  bindings = [];
  connectKicadDoc.mockReset();
  bindKicadCollab.mockReset();
  moduleItemsBridge.mockReset();

  connectKicadDoc.mockImplementation(async ({ room }: { room: string }) => {
    const session: FakeSession = { room, doc: makeDoc(), provider: { destroy: vi.fn() } };
    sessions.push(session);
    return session;
  });
  bindKicadCollab.mockImplementation(() => {
    const b: FakeBinding = {
      seed: vi.fn((_seedDoc: unknown, opts?: unknown) => {
        b.lastSeedOpts = opts;
      }),
      destroy: vi.fn(),
    };
    bindings.push(b);
    return b;
  });
  moduleItemsBridge.mockImplementation(() => ({
    snapshotItems: vi.fn(),
    applyItems: vi.fn(),
    onItems: vi.fn(),
  }));
});

describe("sheet-manager warm pool", () => {
  it("warms each sheet once and dedups re-warming", async () => {
    const m = makeManager();
    await m.connectAll(["a.kicad_sch", "b.kicad_sch"]);
    expect(connectKicadDoc).toHaveBeenCalledTimes(2);
    await m.connectAll(["a.kicad_sch"]); // already warm — no reconnect
    expect(connectKicadDoc).toHaveBeenCalledTimes(2);
  });

  it("first switch binds + seeds the active sheet", async () => {
    const m = makeManager();
    await m.switchTo("a.kicad_sch");
    expect(bindKicadCollab).toHaveBeenCalledTimes(1);
    expect(bindings[0]!.seed).toHaveBeenCalledTimes(1);
    expect(m.active()?.sheetPath).toBe("a.kicad_sch");
  });

  it("switching detaches the old binding but keeps every provider warm", async () => {
    const m = makeManager();
    await m.switchTo("a.kicad_sch");
    await m.switchTo("b.kicad_sch");

    expect(bindings[0]!.destroy).toHaveBeenCalledTimes(1); // old binding detached
    expect(bindKicadCollab).toHaveBeenCalledTimes(2); // new binding for b
    // No provider is torn down on a switch — that's the whole point of the warm pool.
    expect(sessions.every((s) => s.provider.destroy.mock.calls.length === 0)).toBe(true);
  });

  it("re-warms each sheet exactly once across repeated switches", async () => {
    const m = makeManager();
    await m.switchTo("a.kicad_sch");
    await m.switchTo("b.kicad_sch");
    await m.switchTo("a.kicad_sch");
    // a + b connected once each; the revisit reuses the warm room.
    expect(connectKicadDoc).toHaveBeenCalledTimes(2);
  });

  it("a clean revisit rebinds WITHOUT re-applying (baseline-only)", async () => {
    const m = makeManager();
    await m.switchTo("a.kicad_sch");
    await m.switchTo("b.kicad_sch");
    await m.switchTo("a.kicad_sch"); // no remote change arrived while parked
    expect(bindings.at(-1)!.lastSeedOpts).toEqual({ editorMatchesDoc: true });
  });

  it("a remote edit while parked forces a catch-up adopt on revisit", async () => {
    const m = makeManager();
    await m.switchTo("a.kicad_sch");
    const aDoc = sessions[0]!.doc;
    await m.switchTo("b.kicad_sch"); // parks a, starts its update watch
    aDoc.emitRemote(); // remote edit lands on the parked doc
    await m.switchTo("a.kicad_sch");
    expect(bindings.at(-1)!.lastSeedOpts).toEqual({ editorMatchesDoc: false });
  });

  it("onboard connects a mid-session sheet exactly once", async () => {
    const m = makeManager();
    await m.onboard("new.kicad_sch");
    await m.onboard("new.kicad_sch");
    expect(connectKicadDoc).toHaveBeenCalledTimes(1);
  });

  it("destroy tears down every provider and doc", async () => {
    const m = makeManager();
    await m.connectAll(["a.kicad_sch", "b.kicad_sch"]);
    await m.switchTo("a.kicad_sch");
    m.destroy();
    expect(sessions).toHaveLength(2);
    for (const s of sessions) {
      expect(s.provider.destroy).toHaveBeenCalledTimes(1);
      expect(s.doc.destroy).toHaveBeenCalledTimes(1);
    }
    expect(m.active()).toBeNull();
  });

  it("uses the pre-connected entry session (ydoc mode) instead of reconnecting", async () => {
    const entryDoc = makeDoc();
    const entrySession: FakeSession = {
      room: "P:root.kicad_sch",
      doc: entryDoc,
      provider: { destroy: vi.fn() },
    };
    const m = createSheetCollabManager({
      mod: {} as never,
      win: {} as never,
      projectId: "P",
      provider: { kind: "none" } as never,
      seedDocForPath: () => undefined,
      log: () => {},
      initial: {
        sheetPath: "root.kicad_sch",
        session: entrySession as never,
        editorMatchesDoc: true,
      },
    });
    await m.switchTo("root.kicad_sch");
    expect(connectKicadDoc).not.toHaveBeenCalled(); // entry room already connected
    // The ydoc-entry seed is baseline-only (its file was materialized from the doc).
    expect(bindings[0]!.lastSeedOpts).toEqual({ editorMatchesDoc: true });
  });
});
