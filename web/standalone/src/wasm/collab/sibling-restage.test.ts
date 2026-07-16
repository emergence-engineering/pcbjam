import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise ONLY the subscribe/debounce/restage orchestration: the room connect,
// the ydoc materialization, and the MEMFS write are all collaborators.
const { connectKicadDoc, restageFile, ydocHasState } = vi.hoisted(() => ({
  connectKicadDoc: vi.fn(),
  restageFile: vi.fn(),
  ydocHasState: vi.fn(),
}));

vi.mock("./index", () => ({ connectKicadDoc }));
vi.mock("../kicad-runner", () => ({ restageFile }));
vi.mock("@pcbjam/shared", () => ({
  collabRoomId: (s: string, p: string, d: string) => `${s}:${p}:${d}`,
  ydocHasState,
  yToDoc: (doc: unknown) => doc,
  docToFile: () => "(kicad_sch materialized)",
}));

import { startSiblingRestage } from "./sibling-restage";

interface FakeSession {
  room: string;
  doc: {
    on: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    emitRemote: () => void;
  };
  provider: {
    destroy: ReturnType<typeof vi.fn>;
    awareness: { setLocalState: ReturnType<typeof vi.fn> };
  };
}

let sessions: FakeSession[];

function makeSession(room: string): FakeSession {
  const handlers = new Set<() => void>();
  return {
    room,
    doc: {
      on: vi.fn((ev: string, cb: () => void) => {
        if (ev === "update") handlers.add(cb);
      }),
      destroy: vi.fn(),
      emitRemote: () => handlers.forEach((h) => h()),
    },
    provider: {
      destroy: vi.fn(),
      awareness: { setLocalState: vi.fn() },
    },
  };
}

function start(files: string[]) {
  return startSiblingRestage({
    win: {} as never,
    slug: "proj",
    scopeId: "S",
    projectId: "P",
    files: files.map((path) => ({ path })),
    provider: { kind: "none" } as never,
    log: () => {},
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessions = [];
  connectKicadDoc.mockReset().mockImplementation(({ room }: { room: string }) => {
    const s = makeSession(room);
    sessions.push(s);
    return Promise.resolve(s);
  });
  restageFile.mockReset();
  ydocHasState.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startSiblingRestage", () => {
  it("subscribes only the .kicad_sch siblings, as an invisible observer", async () => {
    await start(["main.kicad_pcb", "main.kicad_sch", "sub.kicad_sch", "a.kicad_wks"]);
    expect(sessions.map((s) => s.room)).toEqual([
      "S:P:main.kicad_sch",
      "S:P:sub.kicad_sch",
    ]);
    for (const s of sessions) {
      expect(s.provider.awareness.setLocalState).toHaveBeenCalledWith(null);
    }
  });

  it("restages once on connect when the room already holds state", async () => {
    await start(["main.kicad_sch"]);
    expect(restageFile).toHaveBeenCalledTimes(1);
    expect(restageFile.mock.calls[0]![2]).toBe("main.kicad_sch");
  });

  it("leaves the boot snapshot alone when the room is empty", async () => {
    ydocHasState.mockReturnValue(false);
    await start(["main.kicad_sch"]);
    expect(restageFile).not.toHaveBeenCalled();
  });

  it("debounces remote updates into one restage", async () => {
    await start(["main.kicad_sch"]);
    restageFile.mockClear();
    sessions[0]!.doc.emitRemote();
    sessions[0]!.doc.emitRemote();
    sessions[0]!.doc.emitRemote();
    expect(restageFile).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(restageFile).toHaveBeenCalledTimes(1);
  });

  it("destroy tears down providers and cancels pending restages", async () => {
    const handle = await start(["main.kicad_sch", "sub.kicad_sch"]);
    restageFile.mockClear();
    sessions[0]!.doc.emitRemote();
    handle.destroy();
    vi.runAllTimers();
    expect(restageFile).not.toHaveBeenCalled();
    for (const s of sessions) {
      expect(s.provider.destroy).toHaveBeenCalled();
      expect(s.doc.destroy).toHaveBeenCalled();
    }
  });
});
