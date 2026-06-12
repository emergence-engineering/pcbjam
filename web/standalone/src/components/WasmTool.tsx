import * as React from "react";
import {
  collabRoomId,
  docToFile,
  EXTENSION_TOOL,
  FILELESS_TOOLS,
  fileToDoc,
  kicadItemsMap,
  toolSchema,
  yToDoc,
  type KicadDoc,
  type Tool,
} from "@pcbjam/shared";
import { ChevronDown, ChevronUp } from "lucide-react";
import { WASM_ASSET_BASE_URL, yjsProviderConfig, type DocSource } from "@/lib/config";
import { bootKicadTool } from "@/wasm/boot";
import { memfsFilePath, memfsProjectDir } from "@/wasm/constants";
import { driveProjectIntoTool, type ToolFile } from "@/wasm/kicad-runner";
import { registerSaveHook, type SaveBytes } from "@/wasm/save-flow";
import type { KicadDocSession, KicadItemsWindow } from "@/wasm/collab";
import { clog, cwarn } from "@/wasm/collab/debug";
import { createOomWatch, respawnInNewTab } from "@/recovery/oom-watch";
import { MemoryExhaustedDialog } from "@/recovery/MemoryExhaustedDialog";

// Tools with the v2 items bridge (kicadCollabSnapshotItems/ApplyItems embind exports).
const COLLAB_TOOLS = new Set<Tool>(["pl_editor", "eeschema", "pcbnew"]);
const LEGACY_EXTENSION_TOOL: Record<string, Tool> = {
  ".sch": "eeschema",
  ".brd": "pcbnew",
};

let activeToolNavigationHook:
  | ((toolName: string, fileName: string) => boolean)
  | undefined;

const toolNavigationDispatcher = (toolName: string, fileName: string) =>
  activeToolNavigationHook?.(toolName, fileName) ?? false;

function ensureToolNavigationDispatcher(win: ToolWindow): boolean {
  if (win.kicadWebOpenTool === toolNavigationDispatcher) return true;

  try {
    Object.defineProperty(win, "kicadWebOpenTool", {
      configurable: true,
      value: toolNavigationDispatcher,
    });
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  ensureToolNavigationDispatcher(window as ToolWindow);
}

function normalizeToolName(rawName: string): Tool | null {
  const basename = rawName.replace(/\\/g, "/").split("/").pop() ?? rawName;
  const withoutExe = basename.replace(/\.exe$/i, "");
  const toolName = withoutExe === "pcb_calculator" ? "calculator" : withoutExe;
  const parsed = toolSchema.safeParse(toolName);
  return parsed.success ? parsed.data : null;
}

function relativeProjectPath(slug: string, path: string): string | undefined {
  if (!path) return undefined;

  const normalized = path.replace(/\\/g, "/");
  const prefix = `${memfsProjectDir(slug)}/`;

  if (normalized.startsWith(prefix)) return normalized.slice(prefix.length);

  const marker = `/projects/${slug}/`;
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex >= 0) return normalized.slice(markerIndex + marker.length);

  return normalized.startsWith("/") ? undefined : normalized;
}

function fileStem(path: string): string {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path;
  return name.replace(/\.[^.]+$/, "");
}

function fileTool(path: string): Tool | undefined {
  const lower = path.toLowerCase();

  for (const [extension, mappedTool] of Object.entries({
    ...EXTENSION_TOOL,
    ...LEGACY_EXTENSION_TOOL,
  })) {
    if (lower.endsWith(extension)) return mappedTool;
  }

  return undefined;
}

function chooseToolFile(
  files: ToolFile[],
  nextTool: Tool,
  requestedPath?: string,
  currentPath?: string,
): string | undefined {
  if (requestedPath && files.some((file) => file.path === requestedPath)) {
    return requestedPath;
  }

  const candidates = files.filter((file) => fileTool(file.path) === nextTool);
  const preferredStem = requestedPath
    ? fileStem(requestedPath)
    : currentPath
      ? fileStem(currentPath)
      : undefined;

  if (preferredStem) {
    const matchingStem = candidates.find(
      (file) => fileStem(file.path) === preferredStem,
    );
    if (matchingStem) return matchingStem.path;
  }

  return candidates[0]?.path;
}

function encodeRelPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function installToolNavigationHook(
  win: ToolWindow,
  opts: {
    slug: string;
    files: ToolFile[];
    targetPath?: string;
    log: (m: string) => void;
  },
): () => void {
  const hook = (rawToolName: string, rawFileName: string): boolean => {
    const nextTool = normalizeToolName(rawToolName);

    if (!nextTool) {
      opts.log(`[nav] unsupported KiCad tool: ${rawToolName}`);
      return false;
    }

    const requestedPath = relativeProjectPath(opts.slug, rawFileName);
    const nextPath = FILELESS_TOOLS.has(nextTool)
      ? undefined
      : chooseToolFile(opts.files, nextTool, requestedPath, opts.targetPath);

    if (!FILELESS_TOOLS.has(nextTool) && !nextPath) {
      opts.log(`[nav] no project file found for ${nextTool}: ${rawFileName}`);
      return false;
    }

    const url =
      `/p/${encodeURIComponent(opts.slug)}/${nextTool}` +
      (nextPath ? `/${encodeRelPath(nextPath)}` : "") +
      win.location.search;

    opts.log(`[nav] ${rawToolName} ${rawFileName || "(no file)"} -> ${url}`);
    win.location.assign(url);
    return true;
  };

  if (!ensureToolNavigationDispatcher(win)) {
    opts.log("[nav] unable to install KiCad tool navigation hook");
  }

  activeToolNavigationHook = hook;

  return () => {
    if (activeToolNavigationHook === hook) activeToolNavigationHook = undefined;
  };
}

/**
 * Read the opened file back from MEMFS (what the editor actually loaded) and
 * parse it into the full `KicadDoc` (ysync 0007 `fileToDoc`). Used to seed the
 * Y.Doc LOSSLESSLY when this client opens an empty room (ysync 0005): the doc
 * then carries meta + layout + items, so the file is recoverable from the Y.Doc
 * alone. Falls back to undefined (→ editor-snapshot seed, items only) when the
 * file is absent or doesn't parse as a KiCad s-expr document.
 */
function seedDocFromMemfs(
  win: ToolWindow,
  slug: string,
  targetPath?: string,
): KicadDoc | undefined {
  if (!targetPath) return undefined;
  try {
    const text = win.FS?.readFile(memfsFilePath(slug, targetPath), { encoding: "utf8" });
    if (typeof text !== "string") return undefined;
    return fileToDoc(text);
  } catch (err) {
    cwarn("seed: fileToDoc failed — falling back to editor-snapshot seed", err);
    return undefined;
  }
}

/**
 * The `docSource: "ydoc"` pre-step (config/env-selected — same /p/ URLs as "api"
 * mode): connect the document's collab room BEFORE the file opens and, when the
 * room already holds the doc, materialize the file from it (docToFile) so the
 * editor opens the doc's state instead of the API's copy. An empty room (first
 * ever open) falls back to the API fetch — the seed() that follows file-seeds
 * the room from it. Returns the session for `maybeStartCollab` to attach to.
 */
async function maybeConnectDocSession(
  win: ToolWindow,
  opts: {
    docSource?: DocSource;
    tool: Tool;
    projectId: string;
    targetPath?: string;
    log: (m: string) => void;
  },
): Promise<{ session?: KicadDocSession; targetBytes?: Uint8Array }> {
  if (opts.docSource !== "ydoc") return {};
  if (!opts.targetPath || !COLLAB_TOOLS.has(opts.tool)) return {};

  const { connectKicadDoc } = await import("@/wasm/collab");
  const room = collabRoomId(opts.projectId, opts.targetPath);
  const session = await connectKicadDoc({ provider: yjsProviderConfig(), room });

  if (kicadItemsMap(session.doc).size === 0) {
    opts.log(`[ydoc] room ${room} is empty — falling back to the API fetch (will file-seed)`);
    return { session };
  }
  try {
    const text = docToFile(yToDoc(session.doc));
    opts.log(`[ydoc] materialized ${opts.targetPath} from room ${room} (${text.length} chars)`);
    return { session, targetBytes: new TextEncoder().encode(text) };
  } catch (err) {
    cwarn("ydoc: materialize failed — falling back to the API fetch", err);
    return { session };
  }
}

/**
 * Collaborative editing (ysync 0008, Slot-model items wire), ON BY DEFAULT for any
 * tool that has the collab bridge. Open the same project URL in two tabs to edit
 * together: the channel is keyed to project+file, so both tabs share one Y.Doc over
 * BroadcastChannel. Editor edits (add/move items) fire the tool's change hook → the
 * bridge → the peer tab.
 *
 * Opt OUT with `?collab=0` (or `collab=false`). Tools without a bridge are skipped anyway.
 */
async function maybeStartCollab(
  win: ToolWindow,
  opts: {
    tool: Tool;
    slug: string;
    projectId: string;
    targetPath?: string;
    collabSession?: KicadDocSession;
    /** The opened file was materialized from collabSession's doc (ydoc source). */
    editorMatchesDoc?: boolean;
    log: (m: string) => void;
    onStatus: (t: string) => void;
  },
): Promise<void> {
  const collabParam = new URLSearchParams(win.location.search).get("collab");
  const mod = win.Module;
  clog("maybeStartCollab gate:", {
    collabParam,
    tool: opts.tool,
    hasModule: !!mod,
    hasSnapshotItems: typeof mod?.kicadCollabSnapshotItems,
    hasApplyItems: typeof mod?.kicadCollabApplyItems,
    url: win.location.href,
  });

  // On by default; only an explicit opt-out disables it. A pre-connected doc
  // session (Y.Doc-load path) ignores the opt-out: the doc IS the data source,
  // so detaching would silently drop every edit.
  if (!opts.collabSession && (collabParam === "0" || collabParam === "false")) {
    clog("disabled (?collab=0) — skipping");
    return;
  }
  if (!COLLAB_TOOLS.has(opts.tool)) {
    clog(`tool ${opts.tool} has no collab bridge — skipping`);
    return;
  }
  if (typeof mod?.kicadCollabSnapshotItems !== "function") {
    cwarn(
      "BRIDGE NOT PRESENT: Module.kicadCollabSnapshotItems is",
      typeof mod?.kicadCollabSnapshotItems,
      `— the loaded ${opts.tool}.wasm predates the v2 items bridge (ysync 0008 Stage C). Rebuild + \`npm run setup:kicad\` and restart the dev server.`,
    );
    return;
  }

  const { startKicadCollab, attachKicadCollab } = await import("@/wasm/collab");
  const seedDoc = seedDocFromMemfs(win, opts.slug, opts.targetPath);

  if (opts.collabSession) {
    // docSource "ydoc": the provider is already connected. When the editor
    // opened the file materialized from this very doc, attach + baseline only;
    // when the room was empty (API fallback), seed() file-seeds it as usual.
    clog("attaching to pre-connected doc session; editorMatchesDoc:", !!opts.editorMatchesDoc);
    attachKicadCollab(mod, win as unknown as KicadItemsWindow, opts.collabSession, {
      seedDoc,
      editorMatchesDoc: opts.editorMatchesDoc,
    });
    opts.log(`[collab] attached to Y.Doc session`);
    opts.onStatus("Collab: connected");
    clog("connected ✓");
    return;
  }

  const provider = yjsProviderConfig();
  // One room per (project, document). Two tabs of the same build compute the
  // same id, so cross-tab BroadcastChannel still works; network providers use it
  // verbatim to namespace + persist (see @pcbjam/shared collabRoomId).
  const room = collabRoomId(opts.projectId, opts.targetPath ?? opts.tool);
  clog("starting collab", provider.kind, "room", room, "seedDoc:", !!seedDoc);
  await startKicadCollab(mod, win as unknown as KicadItemsWindow, {
    provider,
    room,
    seedDoc,
  });
  opts.log(`[collab] ${provider.kind} connected on ${room}`);
  opts.onStatus("Collab: connected");
  clog("connected ✓");
}

/**
 * Boots a KiCad tool directly in this React document (no iframe): builds the
 * Emscripten `Module` config, injects the proven harness scripts (wx.js +
 * <tool>.js, the same artifacts the e2e tests use) into the page, then syncs the
 * project tree into MEMFS and drives File→Open. See src/wasm/boot.ts for why the
 * runtime is single-instance per page load.
 */
export function WasmTool({
  tool,
  slug,
  projectId,
  files,
  targetPath,
  fetchBytes,
  saveBytes,
  docSource,
  assetBaseUrl,
}: {
  tool: Tool;
  slug: string;
  /** Stable project id — used to key the collab room (see @pcbjam/shared). */
  projectId: string;
  files: ToolFile[];
  targetPath?: string;
  /** Fetch one project-relative file's bytes (contract loader or local folder). */
  fetchBytes: (relPath: string) => Promise<Uint8Array>;
  /**
   * Persist one file the user saved in the editor (File→Save writes MEMFS, then
   * the wasm fires window.kicadCollab.onSave → this). API upload for backend
   * projects, disk write-back/download for local folders; omit to keep saves
   * MEMFS-only (e.g. Y.Doc-backed sessions).
   */
  saveBytes?: SaveBytes;
  /**
   * Where this project's DOCUMENT lives (see lib/config docSourceConfig):
   * "ydoc" materializes the target file from its collab room when the room has
   * state, with `fetchBytes` as the first-open fallback that seeds it. Defaults
   * to "api" (plain fetch + open). Local-folder sessions don't pass this.
   */
  docSource?: DocSource;
  /** Where the WASM glue/artifacts are served from; defaults to VITE_WASM_ASSET_BASE_URL. */
  assetBaseUrl?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);
  const [status, setStatus] = React.useState("Loading tool…");
  const [logs, setLogs] = React.useState<string[]>([]);
  const [showLog, setShowLog] = React.useState(false);
  const [oomExhausted, setOomExhausted] = React.useState(false);

  const base = (assetBaseUrl ?? WASM_ASSET_BASE_URL).replace(/\/$/, "");
  const append = React.useCallback(
    (msg: string) => setLogs((prev) => [...prev.slice(-800), msg]),
    [],
  );

  React.useEffect(() => {
    const removeNavigationHook = installToolNavigationHook(window as ToolWindow, {
      slug,
      files,
      targetPath,
      log: append,
    });

    return () => removeNavigationHook();
  }, [slug, files, targetPath, append]);

  React.useEffect(() => {
    // Guard re-entry: the WASM runtime is process-global and must boot exactly
    // once (see boot.ts). StrictMode is disabled app-wide for the same reason.
    if (startedRef.current) return;
    startedRef.current = true;

    const container = containerRef.current;
    if (!container) {
      setStatus("Error: tool container not mounted");
      return;
    }

    const win = window as ToolWindow;

    // OOM recovery (feature 0002): watch for soft aborts + a stale hard-kill
    // sentinel, respawning a fresh tab (capped). If the chain is already
    // exhausted, skip boot and show the terminal dialog.
    const oom = createOomWatch({
      channelKey: `${slug}:${targetPath ?? tool}`,
      showExhaustedDialog: () => setOomExhausted(true),
      log: append,
    });
    const { proceed } = oom.start();
    if (!proceed) return;

    void (async () => {
      try {
        await bootKicadTool({
          tool,
          base,
          container,
          log: append,
          onStatus: setStatus,
          onAbort: oom.onAbort,
        });
        // Register the save sink before the file opens: from here on, every
        // editor File→Save (MEMFS write) is routed onward through saveBytes.
        registerSaveHook(win, { slug, saveBytes, log: append, onStatus: setStatus });
        const { session, targetBytes } = await maybeConnectDocSession(win, {
          docSource,
          tool,
          projectId,
          targetPath,
          log: append,
        });
        await driveProjectIntoTool(win, {
          tool,
          slug,
          files,
          targetPath,
          // ydoc source with a populated room: the target file's bytes come
          // from the doc; everything else (sibling files) still fetches.
          fetchBytes:
            targetBytes && targetPath
              ? (relPath) =>
                  relPath === targetPath ? Promise.resolve(targetBytes) : fetchBytes(relPath)
              : fetchBytes,
          log: append,
          onStatus: setStatus,
        });
        await maybeStartCollab(win, {
          tool,
          slug,
          projectId,
          targetPath,
          collabSession: session,
          editorMatchesDoc: !!targetBytes,
          log: append,
          onStatus: setStatus,
        });
      } catch (err) {
        append(`[fatal] ${String(err)}`);
        setStatus(`Error: ${String(err)}`);
      }
    })();

    return () => oom.stop();
    // Boot is one-shot per mount; deps intentionally exclude files/targetPath so
    // they don't retrigger a (rejected) second boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, slug, base, append]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#1a1a2e]">
      {/*
        wx.js addresses the DOM by id: #main-window is its top-level (id=0)
        window — it owns #canvas (created in boot's preRun) — and #window-container
        parents every child window. Both ids must exist before the runtime boots,
        mirroring the harness HTML (tests/apps/kicad/<tool>.html).
      */}
      <div ref={containerRef} id="main-window" className="absolute inset-0 h-full w-full" />
      <div id="window-container" />

      {oomExhausted && (
        <MemoryExhaustedDialog
          onOpenNewTab={() => respawnInNewTab()}
          onReload={() => window.location.reload()}
        />
      )}

      {status && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded bg-black/70 px-3 py-2 font-mono text-xs text-white">
          {status}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20">
        <button
          className="flex items-center gap-1 bg-black/70 px-3 py-1 font-mono text-xs text-white"
          onClick={() => setShowLog((s) => !s)}
        >
          {showLog ? <ChevronDown size={14} /> : <ChevronUp size={14} />} console
          ({logs.length})
        </button>
        {showLog && (
          <pre className="max-h-64 overflow-auto bg-black/85 p-3 font-mono text-[11px] leading-tight text-green-300">
            {logs.join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}
