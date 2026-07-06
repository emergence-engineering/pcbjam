import * as React from "react";
import {
  collabRoomId,
  docToFile,
  EXTENSION_TOOL,
  FILELESS_TOOLS,
  fileToDoc,
  projectPath,
  projectToolPath,
  toolSchema,
  ydocHasState,
  syncLayoutToY,
  yToDoc,
  type KicadDoc,
  type Tool,
} from "@pcbjam/shared";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  currentScope,
  libsSourceConfig,
  modelsSourceConfig,
  presenceUser,
  yjsProviderConfig,
  type DocSource,
} from "@/lib/config";
import { bootKicadTool } from "@/wasm/boot";
import { resolveWasmBase } from "@/wasm/wasm-assets";
import {
  LIB_BUSY_EVENT,
  LIB_ERROR_EVENT,
  LIB_LOADING_EVENT,
  type LibBusyDetail,
  type LibErrorDetail,
  type LibLoadingDetail,
  type LibsSource,
} from "@/wasm/libs/source";
import {
  MODELS_LOADING_EVENT,
  type ModelsLoadingDetail,
} from "@/wasm/libs/models-bridge";
import { memfsFilePath, memfsProjectDir, TOOL_FRAME } from "@/wasm/constants";
import { driveProjectIntoTool, type ToolFile } from "@/wasm/kicad-runner";
import { registerSaveHook, type SaveBytes } from "@/wasm/save-flow";
import type {
  KicadCollabHandle,
  KicadDocSession,
  KicadItemsWindow,
  YjsProvider,
} from "@/wasm/collab";
import {
  createPresence,
  type PresenceHandle,
  type PresencePeer,
} from "@/wasm/collab/presence";
import {
  bindKicadPresence,
  hasPresenceBridge,
  type PresenceKicadWindow,
} from "@/wasm/collab/presence-kicad";
import { PresenceRoster } from "@/components/PresenceRoster";
import {
  createSheetCollabManager,
  registerSheetChangedHook,
  registerSheetCreatedHook,
  type ActiveSheet,
  type SheetChangedWindow,
  type SheetCollabManager,
  type SheetCreatedWindow,
} from "@/wasm/collab/sheet-manager";
import { clog, cwarn } from "@/wasm/collab/debug";
import type * as Y from "yjs";
import { createOomWatch, respawnInNewTab } from "@/recovery/oom-watch";
import { MemoryExhaustedDialog } from "@/recovery/MemoryExhaustedDialog";
import type { SourceDescriptor } from "@/lib/project-source-shared";
import { SourceChip } from "@/components/SourceChip";

// Tools with the v2 items bridge (kicadCollabSnapshotItems/ApplyItems embind exports).
const COLLAB_TOOLS = new Set<Tool>(["pl_editor", "eeschema", "pcbnew"]);

// Which library item kind each tool browses — drives the load-screen pre-sync
// (warm the right bundles into IDB while the wasm downloads). Tools that don't
// browse a library are omitted (no pre-sync).
const LIB_KIND_FOR_TOOL: Partial<Record<Tool, "symbol" | "footprint">> = {
  symbol_editor: "symbol",
  eeschema: "symbol",
  footprint_editor: "footprint",
  pcbnew: "footprint",
};
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

    // Scope/kind/name grammar: a fileless tool boots at `…/-/:tool`; a file route
    // carries the path (its tool is inferred). Scope = the current URL's scope.
    const scope = currentScope();
    const url =
      (FILELESS_TOOLS.has(nextTool)
        ? projectToolPath(scope, opts.slug, nextTool)
        : projectPath(scope, opts.slug, nextPath)) + win.location.search;

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

  // Use the full doc state (meta + layout + items), NOT just item count: a
  // populated drawing sheet (pl_editor `.kicad_wks`) has zero uuid items, so an
  // items-only check makes a joining tab refetch the stale file instead of
  // materializing the shared doc's current state.
  if (!ydocHasState(session.doc)) {
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
): Promise<KicadCollabHandle | undefined> {
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
    return undefined;
  }
  if (!COLLAB_TOOLS.has(opts.tool)) {
    clog(`tool ${opts.tool} has no collab bridge — skipping`);
    return undefined;
  }
  if (typeof mod?.kicadCollabSnapshotItems !== "function") {
    cwarn(
      "BRIDGE NOT PRESENT: Module.kicadCollabSnapshotItems is",
      typeof mod?.kicadCollabSnapshotItems,
      `— the loaded ${opts.tool}.wasm predates the v2 items bridge (ysync 0008 Stage C). Rebuild + \`npm run setup:kicad\` and restart the dev server.`,
    );
    return undefined;
  }

  const { startKicadCollab, attachKicadCollab } = await import("@/wasm/collab");
  const seedDoc = seedDocFromMemfs(win, opts.slug, opts.targetPath);

  if (opts.collabSession) {
    // docSource "ydoc": the provider is already connected. When the editor
    // opened the file materialized from this very doc, attach + baseline only;
    // when the room was empty (API fallback), seed() file-seeds it as usual.
    clog("attaching to pre-connected doc session; editorMatchesDoc:", !!opts.editorMatchesDoc);
    const handle = attachKicadCollab(mod, win as unknown as KicadItemsWindow, opts.collabSession, {
      seedDoc,
      editorMatchesDoc: opts.editorMatchesDoc,
    });
    opts.log(`[collab] attached to Y.Doc session`);
    opts.onStatus("Collab: connected");
    clog("connected ✓");
    return handle;
  }

  const provider = yjsProviderConfig();
  // One room per (project, document). Two tabs of the same build compute the
  // same id, so cross-tab BroadcastChannel still works; network providers use it
  // verbatim to namespace + persist (see @pcbjam/shared collabRoomId).
  const room = collabRoomId(opts.projectId, opts.targetPath ?? opts.tool);
  clog("starting collab", provider.kind, "room", room, "seedDoc:", !!seedDoc);
  const handle = await startKicadCollab(mod, win as unknown as KicadItemsWindow, {
    provider,
    room,
    seedDoc,
  });
  opts.log(`[collab] ${provider.kind} connected on ${room}`);
  opts.onStatus("Collab: connected");
  clog("connected ✓");
  return handle;
}

/**
 * Hierarchical-sheet (subschema) collaborative editing for eeschema: every `.kicad_sch`
 * in the design is its own WARM collab room (provider kept open for the session), and the
 * editor's single active-screen binding is re-routed between them on sheet navigation (the
 * C++ `onSheetChanged` hook). Supersedes the single-room `maybeStartCollab` for eeschema;
 * background sheets stay synced at the data layer, the active sheet is bound to the editor.
 *
 * Opt OUT with `?collab=0`; a pre-connected ydoc session ignores the opt-out (the doc IS
 * the data source). Returns undefined when collab is off or the wasm predates the Phase-0
 * items+sheet bridge.
 */
async function startSheetCollab(
  win: ToolWindow,
  opts: {
    slug: string;
    projectId: string;
    targetPath?: string;
    files: ToolFile[];
    /** ydoc mode: the entry sheet's pre-connected room (from maybeConnectDocSession). */
    session?: KicadDocSession;
    /** The entry file was materialized from `session`'s doc (baseline-only first seed). */
    editorMatchesDoc?: boolean;
    onActiveChange: (active: ActiveSheet | null) => void;
    /** Upload sink (project-backed sessions) — used to register a just-created subsheet. */
    saveBytes?: SaveBytes;
    log: (m: string) => void;
    onStatus: (t: string) => void;
  },
): Promise<SheetCollabManager | undefined> {
  const collabParam = new URLSearchParams(win.location.search).get("collab");
  const mod = win.Module;

  if (!opts.session && (collabParam === "0" || collabParam === "false")) {
    clog("[sheet] collab disabled (?collab=0) — skipping");
    return undefined;
  }
  if (typeof mod?.kicadCollabSnapshotItems !== "function") {
    cwarn(
      "[sheet] BRIDGE NOT PRESENT: Module.kicadCollabSnapshotItems is",
      typeof mod?.kicadCollabSnapshotItems,
      "— the loaded eeschema.wasm predates the items+sheet bridge (subschema Phase 0). Rebuild + `npm run setup:kicad` and restart the dev server.",
    );
    return undefined;
  }

  const manager = createSheetCollabManager({
    mod,
    win: win as unknown as KicadItemsWindow,
    projectId: opts.projectId,
    provider: yjsProviderConfig(),
    seedDocForPath: (sheet) => seedDocFromMemfs(win, opts.slug, sheet),
    onActiveChange: opts.onActiveChange,
    log: opts.log,
    initial:
      opts.session && opts.targetPath
        ? {
            sheetPath: opts.targetPath,
            session: opts.session,
            editorMatchesDoc: !!opts.editorMatchesDoc,
          }
        : undefined,
  });

  const sheetPaths = opts.files
    .filter((f) => f.path.endsWith(".kicad_sch"))
    .map((f) => f.path);

  // C++ navigation → rebind the active room to the now-shown sheet.
  registerSheetChangedHook(win as unknown as SheetChangedWindow, (abs) => {
    const rel = relativeProjectPath(opts.slug, abs);
    if (rel) void manager.switchTo(rel);
  });

  // C++ sheet creation ("Add Sheet") → the child .kicad_sch was just written to MEMFS by
  // the hook; register it with the backend + warm its room, so a subsheet placed but never
  // entered or saved still persists (the file-list snapshot can't contain it).
  registerSheetCreatedHook(win as unknown as SheetCreatedWindow, (abs) => {
    const rel = relativeProjectPath(opts.slug, abs);
    if (rel && rel.endsWith(".kicad_sch")) {
      persistCreatedSheet(win, opts.slug, rel, opts.saveBytes, manager, opts.log);
    }
  });

  // Warm every schematic file in the project so later sheet switches are instant.
  void manager.connectAll(sheetPaths);

  if (opts.targetPath) await manager.switchTo(opts.targetPath);
  opts.log(`[sheet] multi-room collab active (${sheetPaths.length} sheet(s) warmed)`);
  opts.onStatus("Collab: connected");
  return manager;
}

/**
 * A subsheet was just created in-editor — the C++ `onSheetCreated` hook has already written
 * the child .kicad_sch to MEMFS. Register it with the backend (so it survives reload and
 * reaches peers) and warm its collab room. Covers a subsheet that's placed but never entered
 * or saved, which the page-load file list can't contain.
 */
function persistCreatedSheet(
  win: ToolWindow,
  slug: string,
  relPath: string,
  saveBytes: SaveBytes | undefined,
  manager: SheetCollabManager,
  log: (m: string) => void,
): void {
  void manager.onboard(relPath);
  if (!saveBytes) return;
  try {
    const bytes = win.FS?.readFile(memfsFilePath(slug, relPath));
    if (!(bytes instanceof Uint8Array)) return;
    void saveBytes(relPath, bytes)
      .then(() => log(`[sheet] registered created subsheet ${relPath} (${bytes.length} bytes)`))
      .catch((err) => cwarn(`[sheet] upload of created subsheet ${relPath} failed`, err));
  } catch (err) {
    cwarn(`[sheet] read of created subsheet ${relPath} failed`, err);
  }
}

/**
 * Wait until the wxWidgets UI has actually built some elements — it populates a
 * frame or two AFTER the boot sequence resolves, so dropping the loading overlay
 * on boot-resolve flashes a blank editor. Polls `wxElementRegistry` (the same
 * "UI built" signal the e2e suite uses) and falls through after a timeout so a
 * tool with a minimal UI can never hang the overlay.
 */
async function waitForWxUi(win: ToolWindow, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((win.wxElementRegistry?.findAll({}).length ?? 0) > 3) return;
    await new Promise((r) => setTimeout(r, 150));
  }
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
  libsSource,
  sourceDescriptor,
}: {
  tool: Tool;
  slug: string;
  /** Stable project id — used to key the collab room (see @pcbjam/shared). */
  projectId: string;
  files: ToolFile[];
  targetPath?: string;
  /** Where this project lives (local / remote-ro / remote-rw) — shown as a chip
   *  so the user knows whether/how Save persists. Omitted ⇒ no chip. */
  sourceDescriptor?: SourceDescriptor;
  /**
   * Override the library source the editor browses. Omitted ⇒ the configured
   * default (`libsSourceConfig`). Used to open a single library scoped to itself
   * — a specific backend lib, or a local `.kicad_sym`/`.kicad_mod` file.
   */
  libsSource?: LibsSource | null;
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
  /** Override the resolved WASM asset base (used verbatim, e.g. e2e fixtures).
   *  Default: resolveWasmBase(tool) — the CDN manifest folder, or flat /wasm. */
  assetBaseUrl?: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const startedRef = React.useRef(false);
  const driftRef = React.useRef<{ stop(): void } | null>(null);
  const presenceRef = React.useRef<PresenceHandle | null>(null);
  const presenceBridgeRef = React.useRef<{ destroy(): void } | null>(null);
  const sheetManagerRef = React.useRef<SheetCollabManager | null>(null);
  // The single-room collab doc (pcbnew/pl_editor), for the layout save-sync
  // (miss 08B); eeschema routes per sheet through the manager instead.
  const collabDocRef = React.useRef<import("yjs").Doc | null>(null);
  const [status, setStatus] = React.useState("Loading tool…");
  const [logs, setLogs] = React.useState<string[]>([]);
  const [showLog, setShowLog] = React.useState(false);
  const [oomExhausted, setOomExhausted] = React.useState(false);
  // Editor lifecycle for the loading chrome: false until the tool has booted +
  // opened (covers the big WASM-compile freeze with a full-screen overlay).
  const [ready, setReady] = React.useState(false);
  // Download progress for the (large) wasm, and a "this is taking too long" flag
  // the overlay raises after a while so a stuck load doesn't read as a silent hang.
  const [progress, setProgress] = React.useState<{
    loaded: number;
    total: number;
  } | null>(null);
  const [slow, setSlow] = React.useState(false);
  // A library item currently being fetched (open/save), for a transient spinner.
  const [libBusy, setLibBusy] = React.useState<string | null>(null);
  // Load-screen pre-sync progress: warming the project's lib bundles into IDB in
  // parallel with the wasm download. Null when idle/done.
  const [libSync, setLibSync] = React.useState<string | null>(null);
  // Last lib error (e.g. a backend 404 on open), shown as a dismissible toast.
  const [libError, setLibError] = React.useState<string | null>(null);
  // Eager whole-library idb→wasm load in flight (the ~tens-of-seconds fat-load on
  // first chooser/editor open). Drives a full-cover overlay so the freeze reads as
  // "loading, just slow" rather than a hang. Null when idle; `done/total` count the
  // per-lib fat-load crossings so the overlay can show a progress bar.
  const [libLoading, setLibLoading] = React.useState<{
    kind: string;
    done: number;
    total: number;
  } | null>(null);
  // Board 3D-model prefetch in flight (background; the viewer works without it —
  // anything still missing lazy-loads per model). Small badge, not an overlay.
  const [modelsSync, setModelsSync] = React.useState<string | null>(null);
  // The OTHER users in this document's collab room (awareness roster) — drives
  // the PresenceRoster chip next to SourceChip. Empty when collab is off, the
  // provider has no awareness (kind "none"), or nobody else is here.
  const [peers, setPeers] = React.useState<PresencePeer[]>([]);

  const append = React.useCallback(
    (msg: string) => setLogs((prev) => [...prev.slice(-800), msg]),
    [],
  );

  // Loading/error chrome for library item fetches (open/save), driven by events
  // the libs bridge dispatches (wasm/libs/source). The fetch is otherwise
  // invisible; a 404 would silently do nothing without this.
  React.useEffect(() => {
    let busyTimer: ReturnType<typeof setTimeout> | undefined;
    const onBusy = (e: Event) => {
      const d = (e as CustomEvent<LibBusyDetail>).detail;
      clearTimeout(busyTimer);
      if (d.busy) {
        // Debounce — only flag slow fetches, so fast ones don't flicker.
        busyTimer = setTimeout(() => setLibBusy(d.name || "library item"), 180);
      } else {
        setLibBusy(null);
      }
    };
    const onError = (e: Event) => {
      setLibError((e as CustomEvent<LibErrorDetail>).detail.message);
    };
    window.addEventListener(LIB_BUSY_EVENT, onBusy);
    window.addEventListener(LIB_ERROR_EVENT, onError);
    return () => {
      clearTimeout(busyTimer);
      window.removeEventListener(LIB_BUSY_EVENT, onBusy);
      window.removeEventListener(LIB_ERROR_EVENT, onError);
    };
  }, []);

  // Auto-dismiss the lib error toast.
  React.useEffect(() => {
    if (!libError) return;
    const t = setTimeout(() => setLibError(null), 6000);
    return () => clearTimeout(t);
  }, [libError]);

  // Full-library eager load overlay. The fat-load fires one loading:true/false
  // pair PER library (222 on the full set), and between them the C++ side parses
  // with the main thread blocked. Show immediately on `true`, and only hide after
  // a short quiet gap on `false` (reset by the next lib's `true`) — so the overlay
  // stays continuous across the whole run and drops shortly after the last lib,
  // instead of flickering 222 times.
  React.useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onLoading = (e: Event) => {
      const d = (e as CustomEvent<LibLoadingDetail>).detail;
      clearTimeout(hideTimer);
      // Update the bar on every event (true and false) so the count reflects the
      // latest lib; arm the hide only when the run reports it's winding down.
      setLibLoading({ kind: d.kind || "library", done: d.done, total: d.total });
      if (!d.loading) {
        hideTimer = setTimeout(() => setLibLoading(null), 700);
      }
    };
    window.addEventListener(LIB_LOADING_EVENT, onLoading);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener(LIB_LOADING_EVENT, onLoading);
    };
  }, []);

  // Board 3D-model prefetch progress (models-bridge prescan) — background badge.
  React.useEffect(() => {
    const onModels = (e: Event) => {
      const d = (e as CustomEvent<ModelsLoadingDetail>).detail;
      setModelsSync(
        d.loading ? `Fetching 3D models — ${d.done}/${d.total}` : null,
      );
    };
    window.addEventListener(MODELS_LOADING_EVENT, onModels);
    return () => window.removeEventListener(MODELS_LOADING_EVENT, onModels);
  }, []);

  // "Taking too long": once the tool has been loading for a while without
  // becoming ready, surface a hint (slow link / something may be wrong) + a
  // reload, so a stalled boot doesn't look like a frozen blank screen.
  React.useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setSlow(true), 60_000);
    return () => clearTimeout(t);
  }, [ready]);

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

    // (Re)bind presence to a collab room's awareness (collab-presence 0001):
    // publish this user's identity and mirror the peers into the roster chip.
    // pcbnew/pl_editor bind once; eeschema rebinds per active sheet, so the
    // roster shows who is on the SAME sheet (room = sheet).
    const startPresence = (provider: YjsProvider | undefined, sheetPath?: string) => {
      presenceBridgeRef.current?.destroy();
      presenceBridgeRef.current = null;
      presenceRef.current?.destroy();
      presenceRef.current = null;
      const awareness = provider?.awareness;
      if (!awareness) {
        setPeers([]);
        return;
      }
      const presence = createPresence({
        awareness,
        user: presenceUser(),
        tool,
        sheetPath,
      });
      presenceRef.current = presence;
      presence.subscribe(setPeers);
      setPeers(presence.peers());
      // Canvas presence (0002): cursor + selection emit and the remote
      // VIEW_OVERLAY render. pcbnew only until the eeschema port (0003); the
      // bridge gate also skips wasm builds predating the presence exports.
      if (tool === "pcbnew" && hasPresenceBridge(win.Module)) {
        presenceBridgeRef.current = bindKicadPresence({
          mod: win.Module,
          win: win as unknown as PresenceKicadWindow,
          presence,
        });
      }
    };

    // Cmd/Ctrl+S belongs to the editor: preventDefault suppresses ONLY the
    // browser's "save page" dialog (observed in Firefox) — the keydown still
    // propagates to the wx canvas handler, which performs the actual save.
    const swallowBrowserSave = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
      }
    };
    win.addEventListener("keydown", swallowBrowserSave, true);

    void (async () => {
      try {
        // Resolve the per-tool asset base at runtime (CDN manifest → versioned
        // folder, or the flat local /wasm in dev). See wasm/wasm-assets.ts.
        const base = await resolveWasmBase(tool, assetBaseUrl);
        // One source instance, shared by the wasm provider AND the pre-sync below
        // (libsSourceConfig builds a fresh one each call — their SyncStack caches
        // must be the same object for the warm-up to benefit the editor).
        const source =
          libsSource !== undefined ? libsSource : libsSourceConfig(projectId);
        // Pre-warm the lib bundles into IDB in PARALLEL with the wasm download, so
        // the editor's first enumerate reads a warm cache instead of freezing on N
        // cold bundle fetches. Non-blocking + best-effort; the SyncStack dedups, so
        // a lib the wasm reaches mid-presync just awaits the same in-flight fetch.
        const libKind = LIB_KIND_FOR_TOOL[tool];
        if (source?.presync && libKind) {
          void source
            .presync({
              kind: libKind,
              onProgress: ({ done, total, current }) =>
                setLibSync(
                  done >= total
                    ? null
                    : `Syncing ${libKind}s — ${current} (${done}/${total})`,
                ),
            })
            .then(() => setLibSync(null))
            .catch((e) => {
              append(`[presync] ${String(e)}`);
              setLibSync(null);
            });
        }
        await bootKicadTool({
          tool,
          base,
          container,
          log: append,
          onStatus: setStatus,
          onAbort: oom.onAbort,
          onProgress: (loaded, total) => setProgress({ loaded, total }),
          libsSource: source,
          // 3D models: lazy per-board source (null unless the CDN manifest is
          // configured) — feeds the board prescan + the viewer's ensure fallback.
          modelsSource: modelsSourceConfig(),
          // footprint_editor/symbol_editor load the pcbnew/eeschema bundle; the
          // frame token tells its single_top launcher which editor frame to open.
          frame: TOOL_FRAME[tool],
        });
        // Register the save sink before the file opens: from here on, every
        // editor File→Save (MEMFS write) is routed onward through saveBytes.
        registerSaveHook(win, {
          slug,
          saveBytes,
          log: append,
          onStatus: setStatus,
          // A sheet created mid-session ("Add Sheet") saves to a new .kicad_sch path the
          // page-load file list can't contain — warm its collab room so it stays in sync.
          onSaved: (relPath) => {
            if (relPath.endsWith(".kicad_sch")) void sheetManagerRef.current?.onboard(relPath);
          },
          // Non-item document state (title block, paper, setup…) only reaches the
          // room at seed time; reconcile it from every save (miss 08B).
          onSavedText: (relPath, text) => {
            if (sheetManagerRef.current) {
              sheetManagerRef.current.syncLayoutFromSave(relPath, text);
              return;
            }
            if (collabDocRef.current && relPath === targetPath) {
              try {
                syncLayoutToY(fileToDoc(text), collabDocRef.current, "layout-save");
              } catch (err) {
                append(`[save] layout sync failed: ${String(err)}`);
              }
            }
          },
        });
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
        // Drift detection: while a sheet is collaboratively edited, periodically (every N
        // edits + at session end) compare the WASM serialization to the Y.Doc and report
        // divergence. Gated on a real collab session; re-targeted per active sheet below.
        const { startDriftDetection } = await import("@/wasm/collab/drift-detect");

        if (tool === "eeschema") {
          // Multi-room (subschema) collab: every .kicad_sch is its own warm room; the
          // active sheet is bound, navigation re-routes it (C++ onSheetChanged hook).
          sheetManagerRef.current =
            (await startSheetCollab(win, {
              slug,
              projectId,
              targetPath,
              files,
              session,
              saveBytes,
              editorMatchesDoc: !!targetBytes,
              // Re-point drift detection + presence at whichever sheet is bound.
              onActiveChange: (activeRoom) => {
                driftRef.current?.stop();
                driftRef.current = null;
                startPresence(activeRoom?.provider, activeRoom?.sheetPath);
                if (activeRoom) {
                  driftRef.current = startDriftDetection({
                    doc: activeRoom.doc,
                    mod: win.Module,
                    win,
                    tool,
                    slug,
                    targetPath: activeRoom.sheetPath,
                    log: append,
                  });
                }
              },
              log: append,
              onStatus: setStatus,
            })) ?? null;
        } else {
          const collabHandle = await maybeStartCollab(win, {
            tool,
            slug,
            projectId,
            targetPath,
            collabSession: session,
            editorMatchesDoc: !!targetBytes,
            log: append,
            onStatus: setStatus,
          });
          collabDocRef.current = collabHandle?.doc ?? null;
          startPresence(collabHandle?.provider);
          if (collabHandle && targetPath && COLLAB_TOOLS.has(tool)) {
            driftRef.current = startDriftDetection({
              doc: collabHandle.doc,
              mod: win.Module,
              win,
              tool,
              slug,
              targetPath,
              log: append,
            });
          }
        }
        // Tool booted + project opened. Wait for the wx UI to actually build
        // before dropping the overlay, so we don't reveal a still-blank editor.
        await waitForWxUi(win);
        setStatus("");
        setReady(true);
      } catch (err) {
        append(`[fatal] ${String(err)}`);
        setStatus(`Error: ${String(err)}`);
      }
    })();

    return () => {
      win.removeEventListener("keydown", swallowBrowserSave, true);
      presenceBridgeRef.current?.destroy();
      presenceBridgeRef.current = null;
      presenceRef.current?.destroy();
      presenceRef.current = null;
      driftRef.current?.stop();
      driftRef.current = null;
      // Tears down every warm room's provider/doc (the only place providers are
      // destroyed — switching sheets keeps them connected) and clears drift via
      // onActiveChange(null).
      sheetManagerRef.current?.destroy();
      sheetManagerRef.current = null;
      collabDocRef.current = null;
      oom.stop();
    };
    // Boot is one-shot per mount; deps intentionally exclude files/targetPath so
    // they don't retrigger a (rejected) second boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, slug, assetBaseUrl, append]);

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

      {/* Boot overlay — covers the big WASM download/compile freeze until the
          tool has booted + opened. */}
      {!ready && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#1a1a2e] text-white">
          {status.startsWith("Error") ? (
            <>
              <p className="max-w-md px-6 text-center font-mono text-sm text-red-300">
                {status}
              </p>
              <button
                className="rounded border border-white/30 px-3 py-1 text-xs hover:bg-white/10"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </>
          ) : (
            <>
              <Loader2 className="animate-spin" size={32} />
              <p className="font-mono text-sm text-white/80">
                {status || "Loading…"}
              </p>
              <DownloadProgress progress={progress} />
              {libSync && (
                <p className="font-mono text-xs text-emerald-300/90">{libSync}</p>
              )}
              <p className="font-mono text-xs text-white/40">
                First load downloads the tool (large) — this can take a moment.
              </p>
              {slow && (
                <>
                  <p className="max-w-sm px-6 text-center font-mono text-xs text-amber-300/90">
                    This is taking longer than usual — a slow connection, or
                    something may be wrong. You can keep waiting, or reload.
                  </p>
                  <button
                    className="rounded border border-white/30 px-3 py-1 text-xs hover:bg-white/10"
                    onClick={() => window.location.reload()}
                  >
                    Reload
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Eager library load overlay — the first chooser/editor open hydrates the
          whole library set from IDB into wasm (tens of seconds on the full CDN
          set) with the main thread blocked. Cover the (frozen) editor so it reads
          as "loading, just slow" rather than a hang. Shown post-boot; before
          `ready` the boot overlay already covers it. */}
      {ready && libLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#1a1a2e]/95 text-white">
          <Loader2 className="animate-spin" size={32} />
          <p className="font-mono text-sm text-white/80">
            {libLoading.kind === "library"
              ? "Loading libraries…"
              : `Loading ${libLoading.kind} libraries…`}
          </p>
          {libLoading.total > 0 && (
            <div className="w-64 max-w-[70vw]">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-[width] duration-200 ease-out"
                  style={{
                    width: `${Math.min(100, Math.round((libLoading.done / libLoading.total) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-center font-mono text-[11px] text-white/50">
                {Math.min(libLoading.done, libLoading.total)} / {libLoading.total}{" "}
                libraries
              </p>
            </div>
          )}
          <p className="max-w-sm px-6 text-center font-mono text-xs text-white/40">
            Moving the library set into the editor. The first open can take a
            moment — it's cached after this.
          </p>
        </div>
      )}

      {/* Transient post-boot status (e.g. file open). */}
      {ready && status && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded bg-black/70 px-3 py-2 font-mono text-xs text-white">
          {status}
        </div>
      )}

      {/* Top-right overlay chips: who else is in this file (awareness roster) +
          where this project lives / whether Save persists. */}
      {ready && (peers.length > 0 || sourceDescriptor) && (
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          {peers.length > 0 && <PresenceRoster peers={peers} />}
          {sourceDescriptor && <SourceChip descriptor={sourceDescriptor} />}
        </div>
      )}

      {/* Lib pre-sync still warming IDB after the editor opened (big set) — small
          unobtrusive indicator so the user knows browsing is still filling in. */}
      {ready && libSync && (
        <div className="pointer-events-none absolute bottom-9 left-3 z-20 flex items-center gap-2 rounded bg-black/80 px-3 py-1.5 text-xs text-emerald-200">
          <Loader2 className="animate-spin" size={14} /> {libSync}
        </div>
      )}

      {/* Board 3D models still prefetching into the cache (background). */}
      {ready && modelsSync && (
        <div className="pointer-events-none absolute bottom-[4.25rem] left-3 z-20 flex items-center gap-2 rounded bg-black/80 px-3 py-1.5 text-xs text-sky-200">
          <Loader2 className="animate-spin" size={14} /> {modelsSync}
        </div>
      )}

      {/* A library item is being fetched (open/save). */}
      {ready && libBusy && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2 rounded bg-black/80 px-3 py-1.5 text-xs text-white">
          <Loader2 className="animate-spin" size={14} /> Loading {libBusy}…
        </div>
      )}

      {/* Library error (e.g. a backend 404 on open) — auto-dismisses. */}
      {libError && (
        <button
          className="absolute left-1/2 top-3 z-40 max-w-md -translate-x-1/2 rounded bg-red-950/95 px-3 py-2 text-center text-xs text-red-100 shadow-lg ring-1 ring-red-500/40"
          onClick={() => setLibError(null)}
          title="Dismiss"
        >
          {libError}
        </button>
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

/**
 * WASM download progress for the boot overlay. A determinate bar when the server
 * sent a Content-Length the decoded stream agrees with; otherwise just MB so far
 * (gzip/br makes Content-Length the COMPRESSED size, so `loaded` can pass it).
 */
function DownloadProgress({
  progress,
}: {
  progress: { loaded: number; total: number } | null;
}) {
  if (!progress) return null;
  const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
  const determinate = progress.total > 0 && progress.loaded <= progress.total;
  const pct = determinate
    ? Math.round((progress.loaded / progress.total) * 100)
    : 0;
  return (
    <div className="w-64 max-w-[80vw]">
      {determinate ? (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded bg-white/15">
            <div
              className="h-full rounded bg-white/70 transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-center font-mono text-xs text-white/50">
            {mb(progress.loaded)} / {mb(progress.total)} ({pct}%)
          </p>
        </>
      ) : (
        <p className="text-center font-mono text-xs text-white/50">
          {mb(progress.loaded)} downloaded…
        </p>
      )}
    </div>
  );
}
