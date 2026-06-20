import { afterEach, describe, expect, it, vi } from "vitest";

const MANIFEST_URL = "https://cdn.pcbjam.com/content/2.7.7/manifest.json";
const MANIFEST = {
  schema: 1,
  tag: "2.7.7",
  builtAt: "2026-06-18T00:00:00.000Z",
  projects: [
    {
      slug: "demo-board",
      name: "Demo Board",
      description: "d",
      files: [
        { path: "demo.kicad_pcb", size: 100 },
        { path: "sub/x.kicad_sch", size: 5 },
      ],
    },
  ],
};

// project-source reads config at import time; mock it fresh then dynamic-import.
async function loadStatic() {
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    API_BASE_URL: "http://localhost:3050",
    PROJECT_SOURCE_KIND: "static",
    PROJECT_MANIFEST_URL: MANIFEST_URL,
    // Local IDB store off ⇒ the active source is the plain static gallery
    // (no composite), which is what these read-only assertions cover.
    LOCAL_PROJECTS_ENABLED: false,
  }));
  return (await import("./project-source")).projectSource;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("static project source", () => {
  it("is read-only with no upload target (saves download to local)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const src = (await loadStatic())();
    expect(src.readOnly).toBe(true);
    expect(src.uploadFileBytes).toBeUndefined();
  });

  it("lists projects from the manifest with stable uuid ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => MANIFEST })),
    );
    const src = (await loadStatic())();
    const projects = await src.listProjects();
    expect(projects).toHaveLength(1);
    const p = projects[0]!;
    expect(p.slug).toBe("demo-board");
    expect(p.name).toBe("Demo Board");
    expect(p.id).toMatch(UUID_RE);
    // Deterministic: the same slug resolves to the same id across calls.
    expect((await src.listProjects())[0]!.id).toBe(p.id);
  });

  it("returns a project's file tree; throws for an unknown slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => MANIFEST })),
    );
    const src = (await loadStatic())();
    const pwf = await src.getProject("demo-board");
    expect(pwf.files.map((f) => f.path)).toEqual([
      "demo.kicad_pcb",
      "sub/x.kicad_sch",
    ]);
    expect(pwf.files[0]!.projectId).toBe(pwf.project.id);
    await expect(src.getProject("nope")).rejects.toThrow(/project not found/);
  });

  it("fetches bytes from <manifestDir>/<slug>/<path> and caches the manifest", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(async (url: string, _opts?: RequestInit) =>
      url === MANIFEST_URL
        ? { ok: true, json: async () => MANIFEST }
        : { ok: true, arrayBuffer: async () => bytes.buffer },
    );
    vi.stubGlobal("fetch", fetchMock);
    const src = (await loadStatic())();
    await src.listProjects(); // loads the manifest once
    const got = await src.fetchFileBytes("demo-board", "sub/x.kicad_sch");
    expect(Array.from(got)).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.pcbjam.com/content/2.7.7/demo-board/sub/x.kicad_sch",
    );
    // Manifest fetched exactly once (in-memory cached), uncached over the network.
    const manifestCalls = fetchMock.mock.calls.filter((c) => c[0] === MANIFEST_URL);
    expect(manifestCalls).toHaveLength(1);
    expect(manifestCalls[0]![1]).toEqual({ cache: "no-store" });
  });
});
