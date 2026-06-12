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
}

/** The function the WASM `SCH_IO_PCBJAM_LIB` plugin calls via the JS bridge. */
export type KicadLibsRequest = (
  op: string,
  lib: string,
  arg: string,
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
 * Install `window.kicadLibs` backed by a `LibsSource`. The plugin calls
 * `request(op, "/mnt/pcbjam/<id>", arg)`:
 *   "list" -> JSON {"symbols":[...]}   (symbol names in the lib)
 *   "get"  -> the item body s-expr     (arg = symbol name)
 */
export function installLibsProvider(
  source: LibsSource,
  log: (msg: string) => void,
): void {
  if (window.kicadLibs) return;
  const delay = artificialDelayMs();

  const request: KicadLibsRequest = async (op, lib, arg) => {
    const id = libIdFromUri(lib);
    log(`[libs] request op=${op} lib=${lib} (id=${id}) arg=${arg}`);
    if (!id) return null;
    if (delay) await sleep(delay);

    try {
      switch (op) {
        case "list": {
          const items = await source.listItems(id);
          const symbols = items
            .filter((i) => i.kind === "symbol")
            .map((i) => i.name);
          return JSON.stringify({ symbols });
        }
        case "get":
          return await source.getItemBody(id, "symbol", arg);
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
