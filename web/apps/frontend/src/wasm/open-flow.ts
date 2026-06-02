/**
 * Drive the tool (running in `win` — the top-level window) to open a file
 * already written into its MEMFS.
 *
 * Two strategies, tried in order:
 *   1. Programmatic hook — `win.Module.kicadOpenFile(path)` if the build exposes
 *      one. PREFERRED (spec §11.2): deterministic, no UI automation. Not present
 *      in the current build; adding it is a small embind change.
 *   2. UI automation fallback — synthesize canvas mouse/keyboard events using
 *      win.wxElementRegistry coordinates (a browser port of
 *      tests/kicad/load-pcb.spec.ts). Inherently fragile; EXPERIMENTAL, needs
 *      in-browser validation.
 */

export interface OpenFlowOptions {
  log: (msg: string) => void;
  timeoutMs?: number;
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

function registry(win: ToolWindow): WxElementRegistry | undefined {
  return win.wxElementRegistry;
}

function visible(
  win: ToolWindow,
  filter: { type?: string; name?: string; label?: string },
): WxElementInfo[] {
  return registry(win)?.findAll({ ...filter, visible: true }) ?? [];
}

function canvasOf(win: ToolWindow): HTMLCanvasElement | null {
  return (win.Module?.canvas as HTMLCanvasElement) ?? null;
}

/** Dispatch a full pointer+mouse click at page coordinates on the tool canvas. */
function clickAt(win: ToolWindow, x: number, y: number): void {
  const el = canvasOf(win);
  if (!el) return;
  const PE = win.PointerEvent ?? PointerEvent;
  const ME = win.MouseEvent ?? MouseEvent;
  const base = { clientX: x, clientY: y, bubbles: true, cancelable: true };
  el.dispatchEvent(new PE("pointerdown", { ...base, pointerId: 1 }));
  el.dispatchEvent(new ME("mousedown", { ...base, button: 0 }));
  el.dispatchEvent(new PE("pointerup", { ...base, pointerId: 1 }));
  el.dispatchEvent(new ME("mouseup", { ...base, button: 0 }));
  el.dispatchEvent(new ME("click", { ...base, button: 0 }));
}

function typeText(win: ToolWindow, text: string): void {
  const el = canvasOf(win) ?? win.document.body;
  const KE = win.KeyboardEvent ?? KeyboardEvent;
  for (const ch of text) {
    const init = { key: ch, bubbles: true, cancelable: true } as KeyboardEventInit;
    el.dispatchEvent(new KE("keydown", init));
    el.dispatchEvent(new KE("keypress", init));
    el.dispatchEvent(new KE("keyup", init));
  }
}

function pressKey(win: ToolWindow, key: string): void {
  const el = canvasOf(win) ?? win.document.body;
  const KE = win.KeyboardEvent ?? KeyboardEvent;
  const init = { key, bubbles: true, cancelable: true } as KeyboardEventInit;
  el.dispatchEvent(new KE("keydown", init));
  el.dispatchEvent(new KE("keyup", init));
}

/** True if the build exposes the programmatic open hook. */
function hasProgrammaticHook(win: ToolWindow): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = win.Module as any;
  return !!mod && typeof mod.kicadOpenFile === "function";
}

/**
 * Invoke the programmatic hook. NOTE: kicadOpenFile runs OpenProjectFiles under
 * Asyncify, so the call SUSPENDS and unwinds back to JS before the load finishes
 * — its synchronous return is a falsy placeholder, not the real bool. So we fire
 * it and ignore the return; the caller polls for the loaded schematic instead.
 */
function invokeProgrammaticOpen(
  win: ToolWindow,
  absPath: string,
  log: (m: string) => void,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = win.Module as any;
  mod.kicadOpenFile(absPath);
  log(`[open] invoked Module.kicadOpenFile(${absPath}) (async; polling for load)`);
}

/** Heuristic: the editor frame title drops "untitled" once a real file is open. */
function schematicLoaded(win: ToolWindow): boolean {
  const title = win.document?.title ?? "";
  return title.length > 0 && !/untitled/i.test(title);
}

export async function openFileInTool(
  win: ToolWindow,
  absPath: string,
  opts: OpenFlowOptions,
): Promise<"programmatic" | "ui" | "failed"> {
  const { log } = opts;
  const timeoutMs = opts.timeoutMs ?? 60000;

  // Both strategies need the editor frame up first. Crucially, the programmatic
  // hook (Module.kicadOpenFile → OpenProjectFiles) requires a top window, and
  // embind only registers the hook during runtime init — which lands AFTER the
  // Emscripten FS is ready, i.e. after driveProjectIntoTool calls us. Probing
  // the hook before the frame exists therefore always missed and fell back to
  // UI automation (and the wizard's modal loop then crashed Asyncify). Waiting
  // for a visible Frame guarantees the runtime is initialized, the hook is
  // registered, and a top window exists — so we probe only after this point.
  const ready = await waitFor(
    () =>
      visible(win, {}).some(
        (e) => /Frame$/.test(e.typeName) || e.name.endsWith("Frame"),
      ),
    timeoutMs,
  );
  if (!ready) {
    log("[open] app frame never became visible");
    return "failed";
  }

  // Strategy 1: programmatic hook (preferred — deterministic, no UI automation).
  // Because the call is Asyncify-async we can't trust its return value; instead
  // we invoke it and poll the frame title until the schematic loads. We must NOT
  // fall back to UI automation while the hook is in flight — synthesizing input
  // would re-enter the suspended Asyncify call and corrupt it.
  if (hasProgrammaticHook(win)) {
    invokeProgrammaticOpen(win, absPath, log);
    const loaded = await waitFor(() => schematicLoaded(win), timeoutMs);
    if (loaded) {
      log(`[open] schematic loaded: ${win.document.title}`);
      return "programmatic";
    }
    log("[open] kicadOpenFile did not load the schematic within timeout");
    return "failed";
  }

  // Strategy 2: UI automation fallback (EXPERIMENTAL, fragile). Only when the
  // build has no programmatic hook at all.
  log("[open] no programmatic hook; using EXPERIMENTAL UI automation");

  const fileMenu =
    registry(win)
      ?.findByLabel("File", {})
      ?.find((e) => e.visible) ??
    visible(win, {}).find((e) => e.label === "File");
  if (!fileMenu) {
    log("[open] could not find File menu");
    return "failed";
  }
  clickAt(win, fileMenu.centerX, fileMenu.centerY);
  await sleep(400);

  const openItem =
    registry(win)?.findRenderedByLabel?.("Open...", {})?.[0] ??
    registry(win)?.findByLabel("Open...", {})?.[0];
  if (!openItem) {
    log("[open] could not find Open... item");
    return "failed";
  }
  clickAt(win, openItem.centerX, openItem.centerY);

  const dlg = await waitFor(() => visible(win, { type: "wxFileDialog" })[0], 15000);
  if (!dlg) {
    log("[open] wxFileDialog never appeared");
    return "failed";
  }
  await sleep(800);

  const textInput = visible(win, { type: "wxTextCtrl" }).find(
    (e) => e.name === "text",
  );
  if (!textInput) {
    log("[open] filename text input not found");
    return "failed";
  }
  clickAt(win, textInput.centerX, textInput.centerY);
  await sleep(150);
  typeText(win, absPath);
  await sleep(150);
  pressKey(win, "Enter");
  log(`[open] typed path and pressed Enter: ${absPath}`);
  return "ui";
}
