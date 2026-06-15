import type { LibInfo, LibItemInfo, LibsSource } from "./source";
import { parseKicadSymLib } from "./kicad-sym-parse";

/**
 * A one-lib `LibsSource` over a single local library FILE (a `.kicad_sym` symbol
 * lib, or a `.kicad_mod` footprint) the user picked from a folder. The editor
 * browses it scoped to itself — same bridge path as a backend lib, no MEMFS doc
 * open. Read-only (local files aren't written back through the lib bridge).
 */

// Max board/footprint file-format version the WASM fork parses (mirror backend).
const FORK_MAX_BOARD_VERSION = 20251028;

function capFootprintVersion(body: string): string {
  return body.replace(/\(\s*version\s+(\d+)\s*\)/, (m, v) =>
    Number(v) > FORK_MAX_BOARD_VERSION ? `(version ${FORK_MAX_BOARD_VERSION})` : m,
  );
}

function footprintName(text: string, fallback: string): string {
  const m = text.match(/\(\s*footprint\s+"((?:[^"\\]|\\.)*)"/);
  return m ? m[1]!.replace(/\\(.)/g, "$1") : fallback;
}

export function localFileLibsSource(
  libId: string,
  text: string,
  kind: "symbol" | "footprint",
): LibsSource {
  const lib: LibInfo = {
    id: libId,
    name: libId,
    description: `Local ${kind} library (${libId})`,
  };

  if (kind === "footprint") {
    const name = footprintName(text, libId);
    const body = capFootprintVersion(text);
    return {
      async listLibs(k?: string): Promise<LibInfo[]> {
        return !k || k === "footprint" ? [lib] : [];
      },
      async listItems(id: string): Promise<LibItemInfo[]> {
        return id === libId ? [{ kind: "footprint", name }] : [];
      },
      async getItemBody(id, k, n): Promise<string | null> {
        return id === libId && k === "footprint" && n === name ? body : null;
      },
    };
  }

  const parsed = parseKicadSymLib(text);
  return {
    async listLibs(k?: string): Promise<LibInfo[]> {
      return !k || k === "symbol" ? [lib] : [];
    },
    async listItems(id: string): Promise<LibItemInfo[]> {
      return id === libId
        ? parsed.names.map((name) => ({ kind: "symbol", name }))
        : [];
    },
    async getItemBody(id, k, n): Promise<string | null> {
      return id === libId && k === "symbol" ? parsed.bodyFor(n) : null;
    },
  };
}
