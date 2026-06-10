import * as React from "react";
import {
  collabRoomId,
  EXTENSION_TOOL,
  FILELESS_TOOLS,
  toolSchema,
  type Tool,
} from "@pcbjam/shared";
import { ChevronDown, ChevronUp } from "lucide-react";
import { WASM_ASSET_BASE_URL, yjsProviderConfig } from "@/lib/config";
import { bootKicadTool } from "@/wasm/boot";
import { memfsProjectDir } from "@/wasm/constants";
import { driveProjectIntoTool, type ToolFile } from "@/wasm/kicad-runner";
import type { CollabWindow } from "@/wasm/collab";
import { clog, cwarn } from "@/wasm/collab/debug";
import { createOomWatch } from "@/recovery/oom-watch";
import { MemoryExhaustedDialog } from "@/recovery/MemoryExhaustedDialog";

// Tools with a working collab bridge (kicadCollabSnapshot/Apply embind exports).
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
 * Collaborative editing (features/yjs-bridge), ON BY DEFAULT for any tool that has the
 * collab bridge. Open the same project URL in two tabs to edit together: the channel is
 * keyed to project+file, so both tabs share one Y.Doc over BroadcastChannel. Editor edits
 * (add/move items) fire the tool's change hook → the bridge → the peer tab.
 *
 * Opt OUT with `?collab=0` (or `collab=false`). Tools without a bridge are skipped anyway.
 */
async function maybeStartCollab(
  win: ToolWindow,
  opts: {
    tool: Tool;
    projectId: string;
    targetPath?: string;
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
    hasSnapshot: typeof mod?.kicadCollabSnapshot,
    hasApply: typeof mod?.kicadCollabApply,
    url: win.location.href,
  });

  // On by default; only an explicit opt-out disables it.
  if (collabParam === "0" || collabParam === "false") {
    clog("disabled (?collab=0) — skipping");
    return;
  }
  if (!COLLAB_TOOLS.has(opts.tool)) {
    clog(`tool ${opts.tool} has no collab bridge — skipping`);
    return;
  }
  if (typeof mod?.kicadCollabSnapshot !== "function") {
    cwarn(
      "BRIDGE NOT PRESENT: Module.kicadCollabSnapshot is",
      typeof mod?.kicadCollabSnapshot,
      `— the loaded ${opts.tool}.wasm predates the collab bridge. Rebuild + \`npm run setup:kicad\` and restart the dev server.`,
    );
    return;
  }

  const { startCollab } = await import("@/wasm/collab");
  const provider = yjsProviderConfig();
  // One room per (project, document). Two tabs of the same build compute the
  // same id, so cross-tab BroadcastChannel still works; network providers use it
  // verbatim to namespace + persist (see @pcbjam/shared collabRoomId).
  const room = collabRoomId(opts.projectId, opts.targetPath ?? opts.tool);
  clog("starting collab", provider.kind, "room", room);
  await startCollab(mod, win as unknown as CollabWindow, { provider, room });
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
        await driveProjectIntoTool(win, {
          tool,
          slug,
          files,
          targetPath,
          fetchBytes,
          log: append,
          onStatus: setStatus,
        });
        await maybeStartCollab(win, { tool, projectId, targetPath, log: append, onStatus: setStatus });
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
        <MemoryExhaustedDialog onReload={() => window.location.reload()} />
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
