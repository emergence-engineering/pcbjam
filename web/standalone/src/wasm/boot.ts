import type { Tool } from "@pcbjam/shared";
import {
  KICAD_CONFIG_DIR,
  RESOURCE_PATH,
  TOOL_ARGV0,
  TOOL_NEEDS_CONFIG_SEED,
} from "./constants";
import { buildSymLibTable, installLibsProvider, type LibsSource } from "./libs/source";
import { libUri, PCBJAM_LIB_MOUNT } from "./libs/uri";

/** The default user lib boot ensures exists, so there's a writable save target. */
const DEFAULT_USER_LIB_NAME = "My Symbols";

/**
 * Boot a KiCad tool directly in the main React document — no iframe.
 *
 * This is a faithful port of the proven harness HTML (tests/apps/kicad/<tool>.html):
 * it builds the same global `Module` config, runs the same preRun steps (create
 * canvas, write images.tar.gz, seed config), then injects `wx.js`, `wx-dom.js`,
 * and `<tool>.js`. The KiCad WASM build is NON-modularized, so it reads a global
 * `var Module` and publishes `FS`/`wxElementRegistry` onto `window` — exactly the
 * surface the iframe approach used, only now in the top-level window.
 *
 * Two browser facts make running in the main document (rather than at /wasm/...)
 * work without touching the build:
 *   - `locateFile` is overridden to resolve `<base>/<file>`, so the .wasm and the
 *     pthread worker script are fetched from the asset dir regardless of the
 *     SPA route the user is on.
 *   - `mainScriptUrlOrBlob` pins the pthread worker to `<base>/<tool>.js`
 *     (same-origin — required: KiCad's pthreads cannot spawn cross-origin).
 *
 * Single-instance: the build owns process-global state (one `Module`, one wasm
 * memory) so only ONE tool can run per page load. A second boot — switching
 * tools, or a stray double-mount — is rejected; switching tools requires a full
 * page navigation (which gives a fresh global scope, same as loading a new HTML).
 */
export interface BootOptions {
  tool: Tool;
  /** Asset base (no trailing slash) where wx.js / <tool>.{js,wasm} / images.tar.gz live. */
  base: string;
  /** Full-screen element that will host the Emscripten <canvas>. */
  container: HTMLElement;
  log: (msg: string) => void;
  onStatus: (text: string) => void;
  /** OOM recovery hook (feature 0002): emscripten `abort()` routes here so a
   *  soft OOM can respawn a fresh tab. Optional — boot works without it. */
  onAbort?: (what: string) => void;
  /** Library source backing `window.kicadLibs`. Null/omitted disables libs
   *  (an empty sym-lib-table is seeded). Its libs become sym-lib-table rows. */
  libsSource?: LibsSource | null;
}

let booted: { tool: Tool; promise: Promise<void> } | null = null;

/**
 * Inject and start the tool's WASM into `window`. Resolves once the glue scripts
 * are loaded (runtime init continues asynchronously afterwards — callers that
 * need the filesystem should wait on `window.FS`, as driveProjectIntoTool does).
 */
export function bootKicadTool(opts: BootOptions): Promise<void> {
  if (booted) {
    if (booted.tool === opts.tool) return booted.promise;
    return Promise.reject(
      new Error(
        `KiCad "${booted.tool}" is already running in this page; its WASM runtime ` +
          `is process-global and cannot be torn down. Reload the page to open ` +
          `"${opts.tool}".`,
      ),
    );
  }
  const promise = doBoot(opts);
  booted = { tool: opts.tool, promise };
  return promise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    // currentScript.src (absolute) is what Emscripten captures as `_scriptName`
    // and uses to derive the script dir + the pthread worker URL.
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load script: ${src}`));
    document.body.appendChild(s);
  });
}

async function doBoot(opts: BootOptions): Promise<void> {
  const { tool, base, container, log, onStatus, onAbort, libsSource } = opts;
  const w = window as ToolWindow;

  // The wasm reads the top-level frame geometry from a GLOBAL `mainWindow`
  // (mainWindow.offsetWidth/offsetHeight/offsetTop — see <tool>.js). The harness
  // HTML defines it as `var mainWindow = document.getElementById('main-window')`;
  // we must do the same or the wasm falls back to a hardcoded 1280x720 frame that
  // mismatches the viewport, breaking the whole AUI layout (toolbars/panels).
  (w as unknown as { mainWindow: HTMLElement }).mainWindow = container;

  // libs: install the provider (must exist before any plugin call can suspend
  // on it) and generate the sym-lib-table from the source's libs — both before
  // the wasm boots (the table is seeded in preRun below). No source → empty
  // table, libs disabled.
  let symLibTable = "(sym_lib_table\n  (version 7)\n)\n";
  // Every lib gets an empty placeholder FILE at its URI (not just the mount dir):
  // the symbol-editor save path stat()s the lib file after a successful save
  // (SetSymModificationTime -> wxFileName::GetModificationTime), which errors on
  // a non-existent path. The bytes are virtual (served via window.kicadLibs);
  // this file only satisfies incidental fs checks.
  let libPlaceholderUris: string[] = [];
  if (libsSource) {
    installLibsProvider(libsSource, log);
    try {
      // Ensure the owner has at least one writable user lib to create symbols in.
      let libsList = await libsSource.listLibs();
      if (libsSource.createLib && !libsList.some((l) => l.type === "user")) {
        const created = await libsSource.createLib(DEFAULT_USER_LIB_NAME);
        if (created) {
          libsList = [...libsList, created];
          log(`[libs] created default user lib "${created.name}"`);
        }
      }
      symLibTable = buildSymLibTable(libsList);
      libPlaceholderUris = libsList.map((l) => libUri(l.id));
      log(`[libs] seeded ${libsList.length} lib(s) into sym-lib-table`);
    } catch (e) {
      log(`[libs] listLibs failed, seeding empty table: ${String(e)}`);
    }
  }

  onStatus("Downloading…");

  // Prefetch images.tar.gz in parallel with the (much larger) wasm download —
  // exactly as the harness does. writeResources (in preRun) writes it once ready.
  let resourceData: Uint8Array | null = null;
  void fetch(`${base}/images.tar.gz`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => {
      resourceData = new Uint8Array(buf);
      log(`[boot] prefetched images.tar.gz (${resourceData.length} bytes)`);
    })
    .catch((err) => log(`[boot] images.tar.gz prefetch failed: ${String(err)}`));

  // Use the GLOBAL `FS` (window.FS), exactly as the harness HTML does. This build
  // does NOT export `Module.FS` (touching it aborts: "'FS' was not exported"), but
  // the non-modularized glue declares `var FS` at global scope, so window.FS is
  // live from script-eval time — before preRun runs.
  const moduleFS = (): EmscriptenFS => {
    const FS = w.FS;
    if (!FS) throw new Error("global FS not available in preRun");
    return FS;
  };

  // preRun: create the canvas the tool renders into and mount it in our container.
  const createCanvas = () => {
    const canvas = w.document.createElement("canvas");
    canvas.id = "canvas";
    canvas.style.display = "none";
    // wx.js owns the backing-store size via setWindowRect(); we set only CSS size.
    const width = w.innerWidth;
    const height = w.innerHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.oncontextmenu = (e) => e.preventDefault();
    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        onStatus("WebGL context lost — reload the page.");
        e.preventDefault();
      },
      false,
    );
    container.appendChild(canvas);
    (w.Module as { canvas: HTMLCanvasElement }).canvas = canvas;
    log(`[boot] canvas created ${width}x${height}`);
  };

  // preRun: write the compiled-in KICAD_DATA resources (icons, etc.).
  const writeResources = () => {
    const FS = moduleFS();
    FS.mkdirTree(RESOURCE_PATH);
    if (resourceData) {
      FS.writeFile(`${RESOURCE_PATH}/images.tar.gz`, resourceData);
      log(`[boot] wrote images.tar.gz to ${RESOURCE_PATH}`);
    } else {
      log("[boot] images.tar.gz not ready at preRun (wasm beat the fetch)");
    }
  };

  // preRun (seeding tools only): suppress the first-run setup wizard, whose modal
  // loop crashes Asyncify in our ephemeral MEMFS. Make all settings providers
  // report NeedsUserInput()==false — the wizard's "use defaults" path.
  const seedKicadConfig = () => {
    const FS = moduleFS();
    FS.mkdirTree(KICAD_CONFIG_DIR);
    // libs: the mount point that pcbjam lib URIs (/mnt/pcbjam/<lib>) live under.
    // A real dir so any incidental existence/backup check on the URI passes; the
    // lib contents themselves are served virtually via window.kicadLibs.
    FS.mkdirTree(PCBJAM_LIB_MOUNT);
    // Empty placeholder file per lib so the editor's post-save file-times stat
    // succeeds (the real bytes are served via window.kicadLibs).
    for (const uri of libPlaceholderUris) {
      if (!FS.analyzePath(uri).exists) FS.writeFile(uri, "");
    }
    const writeIfAbsent = (path: string, contents: string) => {
      if (FS.analyzePath(path).exists) return;
      FS.writeFile(path, contents);
      log(`[boot] seeded ${path}`);
    };
    writeIfAbsent(
      `${KICAD_CONFIG_DIR}/kicad_common.json`,
      JSON.stringify(
        {
          do_not_show_again: {
            update_check_prompt: true,
            data_collection_prompt: true,
          },
        },
        null,
        2,
      ),
    );
    // libs: rows generated in doBoot from the lib source; the PCBJAM plugin
    // resolves each via window.kicadLibs.
    writeIfAbsent(`${KICAD_CONFIG_DIR}/sym-lib-table`, symLibTable);
    writeIfAbsent(
      `${KICAD_CONFIG_DIR}/fp-lib-table`,
      "(fp_lib_table\n  (version 7)\n)\n",
    );
    writeIfAbsent(
      `${KICAD_CONFIG_DIR}/design-block-lib-table`,
      "(design_block_lib_table\n  (version 7)\n)\n",
    );
  };

  const preRun = [createCanvas, writeResources];
  if (TOOL_NEEDS_CONFIG_SEED[tool]) preRun.push(seedKicadConfig);

  w.Module = {
    thisProgram: TOOL_ARGV0[tool], // argv[0] for KiCad's DEBUG check
    preRun,
    postRun: [],
    print: (...args: unknown[]) => log(`[out] ${args.join(" ")}`),
    printErr: (...args: unknown[]) => log(`[err] ${args.join(" ")}`),
    setStatus: (text: string) => {
      if (text) onStatus(text);
    },
    // OOM recovery (feature 0002): emscripten calls onAbort on abort() — commonly
    // how an out-of-memory surfaces. Forward it so the watcher can respawn.
    onAbort: (what: unknown) => {
      const msg = what === undefined ? "" : String(what);
      log(`[boot] abort: ${msg}`);
      onAbort?.(msg);
    },
    monitorRunDependencies: () => {},
    onRuntimeInitialized: () => {
      log("[boot] runtime initialized");
      const canvas = (w.Module as { canvas?: HTMLCanvasElement }).canvas;
      if (canvas) canvas.style.display = "block";
      onStatus("");
    },
    // Resolve wasm + pthread worker against the asset base, not the SPA route.
    locateFile: (path: string) => `${base}/${path}`,
    // Pin the pthread worker script (must be same-origin).
    mainScriptUrlOrBlob: `${base}/${tool}.js`,
  };

  // Load order mirrors the harness HTML (tests/apps/kicad/<tool>.html):
  //   wx.js     — defines globals the wasm imports (getConfigEntryLength, …) and
  //               the wxElementRegistry the open-flow drives.
  //   wx-dom.js — the DOM-port shim that defines window.wxDomCreateControl and the
  //               other DOM widget hooks the wasm invokes via EM_ASM. Without it the
  //               tool aborts at startup with "wxDomCreateControl is not defined".
  //   <tool>.js — the tool glue, whose execution captures currentScript.src as
  //               Emscripten's _scriptName.
  await loadScript(`${base}/wx.js`);
  await loadScript(`${base}/wx-dom.js`);
  await loadScript(`${base}/${tool}.js`);
  log(`[boot] injected wx.js + wx-dom.js + ${tool}.js (base=${base})`);
}
