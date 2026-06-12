/**
 * libs 0002 spike: a static JS-side library provider.
 *
 * The kicad fork's SCH_IO_PCBJAM_LIB plugin (lib-table type "PCBJAM") calls
 * `globalThis.kicadLibs.request(op, lib, arg)` through an Asyncify suspension
 * (EM_ASYNC_JS) and blocks the C++ stack until the returned promise resolves:
 *
 *   request("list", "pcbjam://spike", "")  -> JSON {"symbols": [...]}
 *   request("get",  "pcbjam://spike", "R") -> full kicad_symbol_lib s-expr
 *                                             document holding that symbol
 *
 * This stub serves two handcrafted symbols from memory — no server. An
 * artificial delay (`?libdelay=1500` in the URL) exercises the reentrancy
 * question: the tab must stay alive while C++ is suspended mid-fetch.
 */

export const SPIKE_LIB_NICKNAME = "pcbjam-spike";

/**
 * pcbjam lib URIs are absolute POSIX paths under this prefix. Absolute so that
 * KiCad's lib-table URI expansion (ExpandURI -> wxFileName::MakeAbsolute) is a
 * no-op and the path reaches the plugin/provider unmangled — a "scheme://" URI
 * gets rewritten to "/scheme:/..." against the cwd, which differs per project.
 */
export const PCBJAM_LIB_MOUNT = "/mnt/pcbjam";
export const PCBJAM_LIB_PREFIX = `${PCBJAM_LIB_MOUNT}/`;
export const SPIKE_LIB_URI = `${PCBJAM_LIB_PREFIX}spike`;

/** sym-lib-table row seeded at boot (see boot.ts seedKicadConfig). */
export const SPIKE_LIB_TABLE_ROW = `  (lib (name "${SPIKE_LIB_NICKNAME}")(type "PCBJAM")(uri "${SPIKE_LIB_URI}")(options "")(descr "pcbjam libs 0002 spike"))`;

const wrapLib = (symbolBody: string) =>
  `(kicad_symbol_lib (version 20241209) (generator "pcbjam") (generator_version "0.1")
${symbolBody}
)
`;

const SYMBOLS: Record<string, string> = {
  R: `  (symbol "R" (pin_numbers hide) (pin_names (offset 0)) (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "R" (at 2.032 0 90) (effects (font (size 1.27 1.27))))
    (property "Value" "R" (at 0 0 90) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at -1.778 0 90) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Description" "Resistor (pcbjam spike)" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "ki_keywords" "R res resistor" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol "R_0_1"
      (rectangle (start -1.016 -2.54) (end 1.016 2.54) (stroke (width 0.254) (type default)) (fill (type none)))
    )
    (symbol "R_1_1"
      (pin passive line (at 0 3.81 270) (length 1.27)
        (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      (pin passive line (at 0 -3.81 90) (length 1.27)
        (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
    )
  )`,
  C: `  (symbol "C" (pin_numbers hide) (pin_names (offset 0.254)) (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "C" (at 0.635 2.54 0) (effects (font (size 1.27 1.27)) (justify left)))
    (property "Value" "C" (at 0.635 -2.54 0) (effects (font (size 1.27 1.27)) (justify left)))
    (property "Footprint" "" (at 0.9652 -3.81 0) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "Description" "Capacitor (pcbjam spike)" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (property "ki_keywords" "cap capacitor" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
    (symbol "C_0_1"
      (polyline (pts (xy -2.032 -0.762) (xy 2.032 -0.762)) (stroke (width 0.508) (type default)) (fill (type none)))
      (polyline (pts (xy -2.032 0.762) (xy 2.032 0.762)) (stroke (width 0.508) (type default)) (fill (type none)))
    )
    (symbol "C_1_1"
      (pin passive line (at 0 3.81 270) (length 2.794)
        (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      (pin passive line (at 0 -3.81 90) (length 2.794)
        (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
    )
  )`,
};

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

function artificialDelayMs(): number {
  const raw = new URLSearchParams(window.location.search).get("libdelay");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Recover the lib id from a "/mnt/pcbjam/<id>" URI (arrives unmangled). */
function libIdFromUri(lib: string): string | null {
  return lib.startsWith(PCBJAM_LIB_PREFIX)
    ? lib.slice(PCBJAM_LIB_PREFIX.length)
    : null;
}

export function installSpikeLibsProvider(log: (msg: string) => void): void {
  if (window.kicadLibs) return;

  const delay = artificialDelayMs();

  const request: KicadLibsRequest = async (op, lib, arg) => {
    log(`[libs] request op=${op} lib=${lib} arg=${arg} (delay=${delay}ms)`);

    if (libIdFromUri(lib) !== "spike") return null;
    if (delay) await sleep(delay);

    switch (op) {
      case "list":
        return JSON.stringify({ symbols: Object.keys(SYMBOLS) });
      case "get": {
        const body = SYMBOLS[arg];
        return body ? wrapLib(body) : null;
      }
      default:
        return null;
    }
  };

  window.kicadLibs = { request };
  log(`[libs] spike provider installed (${SPIKE_LIB_URI})`);
}
