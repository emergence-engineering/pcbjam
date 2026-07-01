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
  /** Item count, when the source knows it cheaply (manifest/backend) — shown as a
   *  badge in the home-page library list. Omitted ⇒ no badge. */
  itemCount?: number;
}

export interface LibItemInfo {
  kind: string; // 'symbol' | 'footprint' | 'model3d'
  name: string;
}

/** Per-lib progress for {@link LibsSource.presync} (drives the load screen). */
export interface LibPresyncProgress {
  done: number;
  total: number;
  /** Display name of the lib currently being synced (one of the in-flight set). */
  current: string;
}

export interface LibsSource {
  /**
   * Libraries to expose to the editor (one lib-table row each). `kind` (the
   * current tool's item kind, "symbol" | "footprint") filters origins to those
   * holding that kind; user libs are kind-agnostic containers, always listed.
   * Omitted ⇒ all libs.
   */
  listLibs(kind?: string): Promise<LibInfo[]>;
  /** Items in a library (by lib id). */
  listItems(libId: string): Promise<LibItemInfo[]>;
  /**
   * One self-contained item body (a complete `kicad_symbol_lib` s-expr), or
   * null if absent. `kind` is 'symbol' for now.
   */
  getItemBody(libId: string, kind: string, name: string): Promise<string | null>;
  /**
   * ALL items in a library with their bodies, in one shot — the "fat list" that
   * lets the WASM plugin hydrate a whole library in a single bridge crossing
   * instead of N per-item `get`s (see docs/features/libs/0011). Optional: sources
   * that can't bulk-read omit it and the provider falls back to listItems + N
   * getItemBody (the old slow path, kept working for the example backend).
   */
  getAllItems?(
    libId: string,
  ): Promise<Array<{ kind: string; name: string; body: Uint8Array }>>;
  /**
   * Pre-warm this source's per-lib caches (IndexedDB bundles) WITHOUT touching the
   * WASM runtime — call it in parallel with the wasm download so the editor's
   * first enumerate reads a warm cache instead of freezing on N cold bundle
   * fetches. Best-effort: a lib that fails to presync is skipped (it still loads
   * lazily later); the SyncStack dedups, so a lib the wasm reaches mid-presync
   * just awaits the same in-flight fetch. `onProgress` reports per-lib so the load
   * screen can name what's syncing. Optional: sources without a client-side cache
   * (per-item remote) omit it.
   */
  presync?(opts?: {
    /** Limit to libs holding this item kind ("symbol" | "footprint"). */
    kind?: string;
    /** Max concurrent bundle fetches (default 6). */
    concurrency?: number;
    onProgress?: (p: LibPresyncProgress) => void;
    signal?: AbortSignal;
  }): Promise<void>;
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
  // "bodies" returns a framed Uint8Array (raw item bytes, copied as-is across the
  // bridge); every other op returns a string (or null).
) => Promise<string | Uint8Array | null>;

declare global {
  interface Window {
    kicadLibs?: { request: KicadLibsRequest };
  }
}

/**
 * Events the libs bridge dispatches on `window` so the editor chrome (WasmTool)
 * can show a loading state for the otherwise-invisible item fetch, and surface an
 * error when a body can't be loaded (e.g. a backend 404). Decoupled via events so
 * `wasm/libs` stays UI-agnostic.
 */
export const LIB_BUSY_EVENT = "pcbjam:lib-busy";
export const LIB_ERROR_EVENT = "pcbjam:lib-error";

export interface LibBusyDetail {
  busy: boolean;
  op: string;
  kind: string;
  name: string;
}
export interface LibErrorDetail {
  message: string;
}

function emitLibBusy(detail: LibBusyDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LIB_BUSY_EVENT, { detail }));
}
function emitLibError(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LIB_ERROR_EVENT, { detail: { message } }),
  );
}

/** Optional artificial latency (`?libdelay=1500`) to exercise the bridge. */
function artificialDelayMs(): number {
  const raw = new URLSearchParams(window.location.search).get("libdelay");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Slow-path "fat list" for sources without a bulk `getAllItems` (the example
 * backend / per-item remote): just listItems + one getItemBody each. Same N
 * round-trips as before — but it keeps the single WASM-side code path (the plugin
 * always asks for bodies once) working against every source.
 */
async function fallbackGetAllItems(
  source: LibsSource,
  libId: string,
): Promise<Array<{ kind: string; name: string; body: Uint8Array }>> {
  const items = await source.listItems(libId);
  const enc = new TextEncoder();
  const out: Array<{ kind: string; name: string; body: Uint8Array }> = [];
  for (const it of items) {
    const body = await source.getItemBody(libId, it.kind, it.name);
    if (body != null)
      out.push({ kind: it.kind, name: it.name, body: enc.encode(body) });
  }
  return out;
}

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

    // "get"/"save" are user-triggered (open/save an item) and otherwise give no
    // visible feedback — broadcast busy + errors so the editor can show them.
    const userFacing = op === "get" || op === "save";
    if (userFacing) emitLibBusy({ busy: true, op, kind, name: arg });
    try {
      switch (op) {
        case "list": {
          // Each plugin parses its own key: footprints / symbols.
          const key = kind === "footprint" ? "footprints" : "symbols";
          // "bodies" (arg) = the fat list: every item's body in one crossing, so
          // the plugin pre-fills its cache and never per-item `get`s. Falls back
          // to listItems + N getItemBody for sources without bulk read.
          if (arg === "bodies") {
            const all = source.getAllItems
              ? await source.getAllItems(id)
              : await fallbackGetAllItems(source, id);
            const items = all.filter((i) => i.kind === kind);
            // "Copy as-is" framing: a one-line JSON header (names + UTF-8 byte
            // lengths), a newline, then every body's RAW bytes concatenated — no
            // JSON escaping. The C++ bridge memcpy's this straight into the wasm
            // heap; the plugin parses the small header and slices the bodies, so
            // none of the (hundreds of MB of) s-expr gets un-escaped.
            const header = JSON.stringify({
              [key]: items.map((i) => ({ name: i.name, len: i.body.length })),
            });
            const headerBytes = new TextEncoder().encode(header + "\n");
            const total =
              headerBytes.length + items.reduce((n, i) => n + i.body.length, 0);
            const out = new Uint8Array(total);
            out.set(headerBytes, 0);
            let off = headerBytes.length;
            for (const i of items) {
              out.set(i.body, off);
              off += i.body.length;
            }
            return out;
          }
          const items = await source.listItems(id);
          const names = items
            .filter((i) => i.kind === kind)
            .map((i) => i.name);
          return JSON.stringify({ [key]: names });
        }
        case "get": {
          const body = await source.getItemBody(id, kind, arg);
          if (body === null) {
            emitLibError(
              `Couldn't open "${arg}" — the backend has no body for it (404).`,
            );
          }
          return body;
        }
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
          if (!ok) emitLibError(`Couldn't save "${parsed.name}".`);
          return ok ? "ok" : null;
        }
        default:
          return null;
      }
    } catch (e) {
      log(`[libs] request failed: ${String(e)}`);
      if (userFacing) emitLibError(`Failed to ${op} "${arg}".`);
      return null;
    } finally {
      if (userFacing) emitLibBusy({ busy: false, op, kind, name: arg });
    }
  };

  window.kicadLibs = { request };
  log("[libs] provider installed");
}
