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
export const SPIKE_LIB_URI = "pcbjam://spike";

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

/**
 * KiCad's lib-table path handling normalizes URIs as if they were file paths:
 * "pcbjam://spike" arrives as "/pcbjam:/spike" or even
 * "<project-dir>/pcbjam:/spike" (made absolute against the cwd). Recover the
 * lib id after the "pcbjam:" marker. Finding for 0003: give the real plugin a
 * path shape that survives normalization, or normalize C++-side.
 */
function libIdFromMangledUri(lib: string): string | null {
  const m = lib.match(/pcbjam:\/*(.+)$/);
  return m ? m[1] : null;
}

export function installSpikeLibsProvider(log: (msg: string) => void): void {
  if (window.kicadLibs) return;

  const delay = artificialDelayMs();

  const request: KicadLibsRequest = async (op, lib, arg) => {
    log(`[libs] request op=${op} lib=${lib} arg=${arg} (delay=${delay}ms)`);

    if (libIdFromMangledUri(lib) !== "spike") return null;
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
