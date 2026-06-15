/**
 * Browser-side parser for a single-file multi-symbol `.kicad_sym` library, so a
 * local file can be served to the symbol editor as a one-lib `LibsSource`.
 *
 * Ported from the GPL backend's `extract/kicad-symdir.ts` (string-scanning only,
 * no deps). The backend reads the unpacked one-symbol-per-file layout; here a
 * single `.kicad_sym` holds the whole lib, so we enumerate ALL top-level
 * `(symbol …)` blocks and resolve `extends` against siblings in the same file.
 * Bodies are emitted self-contained + version-capped, exactly like the bridge
 * expects (the editor's plugin parses one `kicad_symbol_lib` per item).
 */

// Max symbol-lib format version the WASM fork parses (mirror the backend cap).
const FORK_MAX_LIB_VERSION = 20250925;
// Symbol-level leaf tokens the fork's parser can't handle (lossless to drop).
const FORK_UNSUPPORTED_SYMBOL_TOKENS = ["in_pos_files", "embedded_fonts"];
const UNSUPPORTED_RE = new RegExp(
  `^[\\t ]*\\(\\s*(?:${FORK_UNSUPPORTED_SYMBOL_TOKENS.join("|")})\\s+[^()]*\\)\\s*\\n?`,
  "gm",
);

const unesc = (s: string): string => s.replace(/\\(.)/g, "$1");

/** Skip from `i` (just after an opening quote) to the index past the close. */
function endOfString(src: string, i: number): number {
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"') return i + 1;
    i += 1;
  }
  return i;
}

/** [start, end) of the balanced block beginning at `open` (a `(`), quote-aware. */
function matchParen(src: string, open: number): [number, number] {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      i = endOfString(src, i + 1);
      continue;
    }
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return [open, i + 1];
    }
    i += 1;
  }
  throw new Error("unbalanced parentheses in s-expr");
}

/** Direct children (depth-1 forms) of the outermost `(kicad_symbol_lib …)`. */
function* topChildren(src: string): Generator<string> {
  const open = src.indexOf("(");
  if (open < 0) return;
  let i = src.indexOf("(", open + 1);
  while (i >= 0) {
    const [s, e] = matchParen(src, i);
    yield src.slice(s, e);
    i = src.indexOf("(", e);
  }
}

function symbolName(block: string): string | null {
  const m = block.match(/^\(\s*symbol\s+"((?:[^"\\]|\\.)*)"/);
  return m ? unesc(m[1]!) : null;
}

/** Direct child `(extends "Parent")` of a symbol block, or null. */
function symbolExtends(block: string): string | null {
  let i = block.indexOf("(", 1);
  while (i >= 0 && i < block.length) {
    const [s, e] = matchParen(block, i);
    const form = block.slice(s, e);
    const em = form.match(/^\(\s*extends\s+"((?:[^"\\]|\\.)*)"/);
    if (em) return unesc(em[1]!);
    i = block.indexOf("(", e);
  }
  return null;
}

/** The `kicad_symbol_lib` header forms (version/generator), before any symbol. */
function libHeader(src: string): string {
  const parts: string[] = [];
  for (const form of topChildren(src)) {
    if (/^\(\s*symbol\b/.test(form)) break;
    parts.push(form);
  }
  return parts.join("\n\t");
}

function capVersion(header: string): string {
  return header.replace(/\(\s*version\s+(\d+)\s*\)/, (m, v) =>
    Number(v) > FORK_MAX_LIB_VERSION ? `(version ${FORK_MAX_LIB_VERSION})` : m,
  );
}

const sanitize = (block: string): string => block.replace(UNSUPPORTED_RE, "");

function buildSelfContainedLib(
  header: string,
  parentBlocks: string[],
  primaryBlock: string,
): string {
  const body = [...parentBlocks, primaryBlock]
    .map((b) => sanitize(b).replace(/^/gm, "\t").trimStart())
    .join("\n\t");
  return `(kicad_symbol_lib\n\t${capVersion(header)}\n\t${body}\n)\n`;
}

export interface ParsedSymLib {
  /** All top-level symbol names, file order. */
  names: string[];
  /** Self-contained single-symbol body (parents bundled), or null if absent. */
  bodyFor(name: string): string | null;
}

/** Parse a single-file `.kicad_sym` lib into per-symbol self-contained bodies. */
export function parseKicadSymLib(src: string): ParsedSymLib {
  const header = libHeader(src);
  const blocks = new Map<string, string>();
  const exts = new Map<string, string | null>();
  const names: string[] = [];
  for (const form of topChildren(src)) {
    if (!/^\(\s*symbol\b/.test(form)) continue;
    const name = symbolName(form);
    if (!name) continue;
    names.push(name);
    blocks.set(name, form);
    exts.set(name, symbolExtends(form));
  }

  const resolveChain = (name: string): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>([name]);
    let parent = exts.get(name) ?? null;
    while (parent) {
      if (seen.has(parent)) break; // cycle guard
      seen.add(parent);
      const pb = blocks.get(parent);
      if (!pb) break; // parent not in this file — emit what we have
      chain.unshift(pb);
      parent = exts.get(parent) ?? null;
    }
    return chain;
  };

  return {
    names,
    bodyFor(name: string): string | null {
      const block = blocks.get(name);
      if (!block) return null;
      return buildSelfContainedLib(header, resolveChain(name), block);
    },
  };
}
