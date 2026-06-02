import type { ProjectFile, Tool } from "@kicad-web/contract";
import { FILELESS_TOOLS } from "@kicad-web/contract";
import { memfsFilePath, memfsProjectDir } from "./constants";
import { openFileInTool } from "./open-flow";

export interface DriveOptions {
  tool: Tool;
  slug: string;
  files: ProjectFile[];
  targetPath?: string;
  fetchBytes: (relPath: string) => Promise<Uint8Array>;
  log: (msg: string) => void;
  onStatus: (text: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(
  fn: () => T | null | undefined | false,
  timeoutMs: number,
  intervalMs = 200,
): Promise<T | null> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v as T;
    if (performance.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

function getFS(win: ToolWindow): EmscriptenFS {
  const fs = win.FS ?? win.Module?.FS;
  if (!fs) throw new Error("Emscripten FS not available");
  return fs as EmscriptenFS;
}

/** Mirror the whole project tree into the tool's MEMFS (sync-whole-tree). */
async function syncProjectToMemfs(win: ToolWindow, opts: DriveOptions): Promise<void> {
  const fs = getFS(win);
  fs.mkdirTree(memfsProjectDir(opts.slug));
  for (const file of opts.files) {
    const dest = memfsFilePath(opts.slug, file.path);
    const dir = dest.slice(0, dest.lastIndexOf("/"));
    fs.mkdirTree(dir);
    const bytes = await opts.fetchBytes(file.path);
    fs.writeFile(dest, bytes);
    opts.log(`[memfs] wrote ${dest} (${bytes.length} bytes)`);
  }
}

/**
 * Drive a project into an already-booting tool runtime (booted into `win` by
 * bootKicadTool — the top-level window). Waits for the Emscripten FS, syncs the
 * project tree into MEMFS, then auto-opens the target file.
 */
export async function driveProjectIntoTool(
  win: ToolWindow,
  opts: DriveOptions,
): Promise<void> {
  const { log, onStatus } = opts;

  onStatus("Waiting for runtime…");
  const fsReady = await waitFor(
    () => !!(win.FS && typeof win.FS.writeFile === "function"),
    90000,
  );
  if (!fsReady) throw new Error("runtime did not initialize (no FS) in 90s");

  onStatus("Loading project files…");
  await syncProjectToMemfs(win, opts);

  if (opts.targetPath && !FILELESS_TOOLS.has(opts.tool)) {
    onStatus("Opening file…");
    const abs = memfsFilePath(opts.slug, opts.targetPath);
    const result = await openFileInTool(win, abs, { log });
    log(`[open] result: ${result}`);
  }
  onStatus("");
}
