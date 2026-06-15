/**
 * Parsing helpers for KiCad's unpacked symbol-library format (KiCad 10+).
 *
 * A symbol library is a directory `<Name>.kicad_symdir/` holding one
 * `<Symbol>.kicad_sym` file per symbol; each file is a `(kicad_symbol_lib …)`
 * document wrapping exactly one top-level `(symbol "<Name>" …)`. A derived
 * symbol carries `(extends "<Parent>")`, with the parent in a sibling file —
 * so to serve a self-contained symbol we bundle the parent chain into one
 * `kicad_symbol_lib` document.
 *
 * We don't need a full s-expr parser: a brace-matching scanner that respects
 * quoted strings is enough to slice out balanced `(symbol …)` blocks and read
 * top-level `(property "X" "value")` / `(extends "Parent")` fields.
 *
 * Ported from the closed ingest pipeline so the GPL reference backend can build
 * its own example-lib fixtures at dev time (no closed repo needed). The
 * fork-version caps below track the WASM fork that lives in this same repo.
 */

export interface ParsedSymbol {
  /** Top-level symbol name, e.g. "Speaker_Ultrasound". */
  name: string;
  /** Parent name if this is a derived symbol (`extends`), else null. */
  extends: string | null;
  /** The full balanced `(symbol …)` block text, verbatim from the source. */
  block: string;
  description: string | null;
  keywords: string | null;
  /** Footprint filters (`ki_fp_filters`), whitespace-split, or null. */
  fpFilters: string[] | null;
}

/** Skip from `i` (just after an opening quote) to the index past the close. */
export function endOfString(src: string, i: number): number {
  // i points at the char after the opening `"`.
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2; // escaped char
      continue;
    }
    if (c === '"') return i + 1;
    i += 1;
  }
  return i;
}

/**
 * Return [start, end) of the balanced parenthesised block that begins at
 * `open` (which must index a `(`), respecting quoted strings.
 */
export function matchParen(src: string, open: number): [number, number] {
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

/** Find the first `(symbol "…"` block at the top level of a kicad_symbol_lib. */
function findTopSymbol(src: string): [number, number] {
  // The lib wrapper is `(kicad_symbol_lib … (symbol "…" …) )`. The first
  // `(symbol "` after the wrapper open is the top-level symbol.
  const m = src.match(/\(\s*symbol\s+"/);
  if (!m || m.index === undefined) {
    throw new Error("no (symbol …) found");
  }
  return matchParen(src, m.index);
}

/**
 * Read a top-level `(property "Key" "Value" …)` value from inside a symbol
 * block. Only scans direct children (depth 1 within the block), so nested
 * sub-symbol properties don't shadow the symbol's own.
 */
function topProperty(block: string, key: string): string | null {
  // Children start after the `(symbol "Name"` head. Walk depth-1 forms.
  let i = block.indexOf("(", 1); // first child form
  while (i >= 0 && i < block.length) {
    const [s, e] = matchParen(block, i);
    const form = block.slice(s, e);
    const pm = form.match(
      /^\(\s*property\s+"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"/,
    );
    if (pm && unescape(pm[1]!) === key) return unescape(pm[2]!);
    // advance to next sibling
    i = block.indexOf("(", e);
  }
  return null;
}

export function unescape(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/** Direct child `(extends "Parent")` of a symbol block, or null. */
function topExtends(block: string): string | null {
  let i = block.indexOf("(", 1);
  while (i >= 0 && i < block.length) {
    const [s, e] = matchParen(block, i);
    const form = block.slice(s, e);
    const em = form.match(/^\(\s*extends\s+"((?:[^"\\]|\\.)*)"/);
    if (em) return unescape(em[1]!);
    i = block.indexOf("(", e);
  }
  return null;
}

/** Parse one unpacked `.kicad_sym` document. */
export function parseSymbolFile(src: string): ParsedSymbol {
  const [s, e] = findTopSymbol(src);
  const block = src.slice(s, e);
  const nameMatch = block.match(/^\(\s*symbol\s+"((?:[^"\\]|\\.)*)"/);
  if (!nameMatch) throw new Error("could not read symbol name");
  const fpRaw = topProperty(block, "ki_fp_filters");
  return {
    name: unescape(nameMatch[1]!),
    extends: topExtends(block),
    block,
    description: topProperty(block, "Description"),
    keywords: topProperty(block, "ki_keywords"),
    fpFilters: fpRaw ? fpRaw.split(/\s+/).filter(Boolean) : null,
  };
}

/** Extract just the `(kicad_symbol_lib …` header forms (version/generator). */
export function libHeader(src: string): string {
  const open = src.indexOf("(");
  const headStart = src.indexOf("(", open + 1); // first child of kicad_symbol_lib
  if (headStart < 0) return "";
  // Collect child forms until the first (symbol …).
  let i = headStart;
  const parts: string[] = [];
  while (i >= 0 && i < src.length) {
    const [s, e] = matchParen(src, i);
    const form = src.slice(s, e);
    if (/^\(\s*symbol\b/.test(form)) break;
    parts.push(form);
    i = src.indexOf("(", e);
  }
  return parts.join("\n\t");
}

/**
 * Symbol-level leaf tokens present in KiCad 10.0.3 libraries that our WASM fork
 * (lib format 20250925) does not yet parse — its `parseLibSymbol` switch has no
 * case for them, so they trip `Expecting(...)` and abort the whole parse. They
 * carry no geometry/connectivity, so dropping them is lossless for the editor.
 * Remove this once the fork's symbol parser is bumped to 10.0.x.
 */
const FORK_UNSUPPORTED_SYMBOL_TOKENS = ["in_pos_files", "embedded_fonts"];

/**
 * Max symbol-lib format version the WASM fork parses (SEXPR_SYMBOL_LIB_FILE_VERSION
 * in eeschema/sch_file_versions.h). A lib declaring a NEWER version is rejected
 * up front with FUTURE_FORMAT_ERROR, before any token parsing. The two stripped
 * tokens above are exactly the symbol-level additions between this and the
 * 10.0.3 data version, so once they're gone the body is valid at this version.
 * Bump alongside the fork.
 */
const FORK_MAX_LIB_VERSION = 20250925;

const UNSUPPORTED_RE = new RegExp(
  `^[\\t ]*\\(\\s*(?:${FORK_UNSUPPORTED_SYMBOL_TOKENS.join("|")})\\s+[^()]*\\)\\s*\\n?`,
  "gm",
);

/** Drop leaf tokens the fork's parser can't handle (see above). */
export function sanitizeForFork(block: string): string {
  return block.replace(UNSUPPORTED_RE, "");
}

/** Cap the `(version NNNN)` header so the fork doesn't reject it as future-format. */
export function capVersionForFork(header: string): string {
  return header.replace(/\(\s*version\s+(\d+)\s*\)/, (m, v) =>
    Number(v) > FORK_MAX_LIB_VERSION ? `(version ${FORK_MAX_LIB_VERSION})` : m,
  );
}

/**
 * Build a self-contained `kicad_symbol_lib` document from a primary symbol and
 * its resolved parent chain. Parents are emitted before the derived symbol so
 * the on-device parser resolves `extends` within the single document. Blocks
 * are sanitized for the fork parser on the way out.
 */
export function buildSelfContainedLib(
  header: string,
  parentBlocks: string[],
  primaryBlock: string,
): string {
  const body = [...parentBlocks, primaryBlock]
    .map((b) => sanitizeForFork(b).replace(/^/gm, "\t").trimStart())
    .join("\n\t");
  return `(kicad_symbol_lib\n\t${capVersionForFork(header)}\n\t${body}\n)\n`;
}
