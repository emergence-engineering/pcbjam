import { libIdFromUri, libUri } from "./uri";

/**
 * The data a `LibsSource` provides. A source abstracts WHERE library data comes
 * from (a remote backend over the shared contract, a static public snapshot, a
 * local folder); the WASM-facing provider below is the same regardless.
 */
export interface LibInfo {
  /** Opaque id used in the lib-table URI (/mnt/pcbjam/<id>). */
  id: string;
  /** Display nickname for the sym-lib-table row. */
  name: string;
  description?: string | null;
  /** 'origin' | 'mirror' | 'user' — drives "ensure a user lib exists" at boot. */
  type?: string;
}

export interface LibItemInfo {
  kind: string; // 'symbol' | 'footprint' | 'model3d'
  name: string;
}

export interface LibsSource {
  /** Libraries to expose to the editor (one sym-lib-table row each). */
  listLibs(): Promise<LibInfo[]>;
  /** Items in a library (by lib id). */
  listItems(libId: string): Promise<LibItemInfo[]>;
  /**
   * One self-contained item body (a complete `kicad_symbol_lib` s-expr), or
   * null if absent. `kind` is 'symbol' for now.
   */
  getItemBody(libId: string, kind: string, name: string): Promise<string | null>;
  /**
   * Persist one item body into a writable (user) lib. Optional: read-only
   * sources omit it (a save into a non-writable source resolves false).
   * `body` is a complete fork-native `kicad_symbol_lib` s-expr.
   */
  saveItemBody?(
    libId: string,
    kind: string,
    name: string,
    body: string,
  ): Promise<boolean>;
  /**
   * Create a user library (returns its `LibInfo`, or null if unsupported / on
   * conflict). Used by boot to ensure the owner has a writable target.
   */
  createLib?(name: string): Promise<LibInfo | null>;
}

/**
 * The function the WASM lib plugins call via the JS bridge. Both the symbol
 * plugin (`SCH_IO_PCBJAM_LIB`) and the footprint plugin (`PCB_IO_PCBJAM_FP`)
 * call the same hook; `kind` (4th arg) discriminates the item kind. The symbol
 * plugin omits it (passes 3 args) so it defaults to "symbol" — keeping the
 * existing eeschema binary correct with no rebuild.
 */
export type KicadLibsRequest = (
  op: string,
  lib: string,
  arg: string,
  kind?: string,
) => Promise<string | null>;

declare global {
  interface Window {
    kicadLibs?: { request: KicadLibsRequest };
  }
}

/** Optional artificial latency (`?libdelay=1500`) to exercise the bridge. */
function artificialDelayMs(): number {
  const raw = new URLSearchParams(window.location.search).get("libdelay");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Escape a string for a KiCad s-expr quoted token. */
function sexprEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Build sym-lib-table content (KiCad v7) with one PCBJAM row per lib. */
export function buildSymLibTable(libsList: LibInfo[]): string {
  const rows = libsList.map((l) => {
    const descr = l.description ? sexprEscape(l.description) : "";
    return `  (lib (name "${sexprEscape(l.name)}")(type "PCBJAM")(uri "${libUri(
      l.id,
    )}")(options "")(descr "${descr}"))`;
  });
  return `(sym_lib_table\n  (version 7)\n${rows.join("\n")}${
    rows.length ? "\n" : ""
  })\n`;
}

/**
 * Build fp-lib-table content (KiCad v7) with one PCBJAM_FP row per lib. The
 * footprint editor selects the plugin from this row's `type` field (via
 * PCB_IO_MGR::EnumFromStr), so it MUST be "PCBJAM_FP" to match the registered
 * plugin name. Same /mnt/pcbjam/<id> URI as symbols (the same lib id can appear
 * in both tables — user libs are kind-agnostic containers).
 */
export function buildFpLibTable(libsList: LibInfo[]): string {
  const rows = libsList.map((l) => {
    const descr = l.description ? sexprEscape(l.description) : "";
    return `  (lib (name "${sexprEscape(
      l.name,
    )}")(type "PCBJAM_FP")(uri "${libUri(
      l.id,
    )}")(options "")(descr "${descr}"))`;
  });
  return `(fp_lib_table\n  (version 7)\n${rows.join("\n")}${
    rows.length ? "\n" : ""
  })\n`;
}

/**
 * Install `window.kicadLibs` backed by a `LibsSource`. Both lib plugins call
 * `request(op, "/mnt/pcbjam/<id>", arg, kind)` (kind defaults to "symbol" so the
 * symbol plugin's 3-arg calls still work):
 *   "list" -> JSON {"symbols":[...]} | {"footprints":[...]}  (names of that kind)
 *   "get"  -> the item body s-expr     (arg = item name; null if absent)
 *   "save" -> "ok" / null              (arg = JSON {"name":..,"body":..})
 */
export function installLibsProvider(
  source: LibsSource,
  log: (msg: string) => void,
): void {
  if (window.kicadLibs) return;
  const delay = artificialDelayMs();

  const request: KicadLibsRequest = async (op, lib, arg, kind = "symbol") => {
    const id = libIdFromUri(lib);
    log(`[libs] request op=${op} kind=${kind} lib=${lib} (id=${id}) arg=${arg}`);
    if (!id) return null;
    if (delay) await sleep(delay);

    try {
      switch (op) {
        case "list": {
          const items = await source.listItems(id);
          const names = items
            .filter((i) => i.kind === kind)
            .map((i) => i.name);
          // Each plugin parses its own key: footprints / symbols.
          const key = kind === "footprint" ? "footprints" : "symbols";
          return JSON.stringify({ [key]: names });
        }
        case "get":
          return await source.getItemBody(id, kind, arg);
        case "save": {
          let parsed: { name?: string; body?: string };
          try {
            parsed = JSON.parse(arg) as { name?: string; body?: string };
          } catch {
            log(`[libs] save: bad JSON arg`);
            return null;
          }
          if (!parsed.name || !parsed.body) return null;
          if (!source.saveItemBody) {
            log(`[libs] save: source has no write support (lib=${id})`);
            return null;
          }
          const ok = await source.saveItemBody(
            id,
            kind,
            parsed.name,
            parsed.body,
          );
          return ok ? "ok" : null;
        }
        default:
          return null;
      }
    } catch (e) {
      log(`[libs] request failed: ${String(e)}`);
      return null;
    }
  };

  window.kicadLibs = { request };
  log("[libs] provider installed");
}
