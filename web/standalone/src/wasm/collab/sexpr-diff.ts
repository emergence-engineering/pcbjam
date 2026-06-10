/**
 * `sexprDiff` — a minimal, uuid-keyed STRUCTURAL comparator for KiCad s-expr text
 * (README §B; shared by the live drift check 0003 and the round-trip tests 0004).
 *
 * It is deliberately NOT a domain parser — a full KiCad parse could itself be a
 * source of false positives. It does only four things:
 *
 *   1. Tokenize the s-expr text into a tree of nested lists + atoms (balanced
 *      parens, quoted strings with escapes, bare atoms). No KiCad semantics.
 *   2. Index "item" nodes by uuid: any list node with a direct `(uuid "X")` child
 *      is an item keyed by `X`. Nested items are collected too.
 *   3. Compare order-insensitively, strictly on values: the two item SETS must
 *      have the same uuid keys, and for each shared uuid the two nodes must be
 *      equal as multisets of normalized children (reordering of sibling
 *      properties / items is allowed; any added / removed / value-changed token
 *      is a diff).
 *   4. Emit `{ equal, added, removed, changed }` for readable failures.
 *
 * IMPORTANT — compare like-for-like. This is only false-positive-free when both
 * inputs are produced by the SAME tool serializer (e.g. 0004 saves the live model
 * AND a model rebuilt from the Y.Doc, both through the tool's own writer). Feeding
 * a saved file against decomposed-scalar Y.Doc fields would need a per-type
 * field↔token map — exactly the trap this comparator avoids by construction.
 *
 * Tradeoff of the multiset rule: positional scalar tuples (e.g. `(at X Y)`) are
 * compared as a multiset, so a pure X↔Y swap with otherwise-equal values would
 * not be flagged. Acceptable for same-serializer inputs (the serializer emits a
 * consistent order on both sides); revisit if a value-swap drift class appears.
 *
 * No imports — usable from standalone app code (`@/wasm/collab/sexpr-diff`) and
 * from the Playwright specs (relative import) alike.
 */

/** Parsed node: a `string` is an atom (quoted strings keep their quotes, so a
 *  string value is distinct from the same bare token); an array is a list. */
export type SNode = string | SNode[];

export interface SexprChange {
  uuid: string;
  /** Best-effort location: the head keyword of the differing child, or "·atom"
   *  for a differing positional scalar. */
  path: string;
  /** The differing child as serialized on side A (the base/original), or null
   *  if absent on A. */
  a: string | null;
  /** The differing child as serialized on side B (the new), or null if absent. */
  b: string | null;
}

export interface SexprDiffResult {
  equal: boolean;
  /** uuids present in B but not A. */
  added: string[];
  /** uuids present in A but not B. */
  removed: string[];
  /** per-property differences for uuids present in both. */
  changed: SexprChange[];
}

export interface SexprDiffOptions {
  /** Head keywords whose list nodes are dropped before comparing, at any depth —
   *  for known-volatile serializer output (e.g. "generator_version"). Declared
   *  explicitly so drift is never hidden silently. */
  ignoreTokens?: string[];
}

// ── Parser ──────────────────────────────────────────────────────────────────

/** Parse s-expr text into a flat list of top-level forms (usually one). Throws
 *  on unbalanced parens or an unterminated string. */
export function parseSexpr(src: string): SNode[] {
  let i = 0;
  const n = src.length;
  const isWs = (c: string | undefined) =>
    c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

  const skipWs = () => {
    while (i < n && isWs(src[i])) i++;
  };

  const parseString = (): string => {
    const start = i;
    i++; // opening quote
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        i += 2; // escape — skip the next char too
        continue;
      }
      if (c === '"') {
        i++;
        return src.slice(start, i); // keep surrounding quotes
      }
      i++;
    }
    throw new Error("sexprDiff: unterminated string");
  };

  const parseAtom = (): string => {
    const start = i;
    while (i < n && !isWs(src[i]) && src[i] !== "(" && src[i] !== ")" && src[i] !== '"') i++;
    return src.slice(start, i);
  };

  const parseList = (): SNode[] => {
    i++; // consume '('
    const list: SNode[] = [];
    for (;;) {
      skipWs();
      if (i >= n) throw new Error("sexprDiff: unbalanced parens (EOF inside list)");
      const c = src[i];
      if (c === ")") {
        i++;
        return list;
      }
      if (c === "(") list.push(parseList());
      else if (c === '"') list.push(parseString());
      else list.push(parseAtom());
    }
  };

  const forms: SNode[] = [];
  for (;;) {
    skipWs();
    if (i >= n) break;
    if (src[i] === ")") throw new Error("sexprDiff: unbalanced parens (stray ')')");
    if (src[i] === "(") forms.push(parseList());
    else if (src[i] === '"') forms.push(parseString());
    else forms.push(parseAtom());
  }
  return forms;
}

// ── uuid indexing ─────────────────────────────────────────────────────────────

function stripQuotes(atom: string): string {
  return atom.length >= 2 && atom.startsWith('"') && atom.endsWith('"')
    ? atom.slice(1, -1)
    : atom;
}

/** The uuid of a list node, from its direct `(uuid "X")` child, or null. */
function directUuid(node: SNode[]): string | null {
  for (const c of node) {
    if (Array.isArray(c) && c[0] === "uuid" && typeof c[1] === "string") {
      return stripQuotes(c[1]);
    }
  }
  return null;
}

/** Collect every list node that has a direct uuid child, keyed by uuid. */
function collectItems(node: SNode, out: Map<string, SNode[]>): void {
  if (!Array.isArray(node)) return;
  const id = directUuid(node);
  if (id !== null && !out.has(id)) out.set(id, node);
  for (const c of node) collectItems(c, out);
}

// ── Canonicalization (order-insensitive multiset) ──────────────────────────────

function isIgnored(node: SNode, ignore: Set<string>): boolean {
  return Array.isArray(node) && typeof node[0] === "string" && ignore.has(node[0]);
}

/** Canonical string of a node: atoms verbatim, lists as `(` + sorted children + `)`. */
function canonical(node: SNode, ignore: Set<string>): string {
  if (!Array.isArray(node)) return node;
  const kids = node
    .filter((c) => !isIgnored(c, ignore))
    .map((c) => canonical(c, ignore))
    .sort();
  return "(" + kids.join(" ") + ")";
}

/** Group an item's direct children by head keyword, as canonical strings. */
function groupByHead(node: SNode[], ignore: Set<string>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const c of node) {
    if (isIgnored(c, ignore)) continue;
    const head = Array.isArray(c) && typeof c[0] === "string" ? c[0] : "·atom";
    const list = groups.get(head) ?? [];
    list.push(canonical(c, ignore));
    groups.set(head, list);
  }
  return groups;
}

/** Per-property changes between two item nodes sharing a uuid. */
function diffItem(uuid: string, a: SNode[], b: SNode[], ignore: Set<string>): SexprChange[] {
  const ga = groupByHead(a, ignore);
  const gb = groupByHead(b, ignore);
  const heads = new Set<string>([...ga.keys(), ...gb.keys()]);
  const out: SexprChange[] = [];

  for (const head of heads) {
    const as = (ga.get(head) ?? []).slice().sort();
    const bs = (gb.get(head) ?? []).slice().sort();

    // Multiset difference of the canonical child strings under this head.
    const countB = new Map<string, number>();
    for (const s of bs) countB.set(s, (countB.get(s) ?? 0) + 1);
    const onlyA: string[] = [];
    for (const s of as) {
      const c = countB.get(s) ?? 0;
      if (c > 0) countB.set(s, c - 1);
      else onlyA.push(s);
    }
    const onlyB: string[] = [];
    for (const [s, c] of countB) for (let k = 0; k < c; k++) onlyB.push(s);

    const max = Math.max(onlyA.length, onlyB.length);
    for (let k = 0; k < max; k++) {
      out.push({ uuid, path: head, a: onlyA[k] ?? null, b: onlyB[k] ?? null });
    }
  }
  return out;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Structurally compare two s-expr texts by uuid-keyed items.
 *
 * @param a base / original text (e.g. the as-loaded model save)
 * @param b new text (e.g. the rebuilt-from-Y.Doc model save)
 */
export function sexprDiff(a: string, b: string, opts: SexprDiffOptions = {}): SexprDiffResult {
  const ignore = new Set(opts.ignoreTokens ?? []);
  const itemsA = new Map<string, SNode[]>();
  const itemsB = new Map<string, SNode[]>();
  collectItems(parseSexpr(a), itemsA);
  collectItems(parseSexpr(b), itemsB);

  const removed: string[] = [];
  const added: string[] = [];
  const changed: SexprChange[] = [];

  for (const id of itemsA.keys()) if (!itemsB.has(id)) removed.push(id);
  for (const id of itemsB.keys()) if (!itemsA.has(id)) added.push(id);

  for (const [id, na] of itemsA) {
    const nb = itemsB.get(id);
    if (!nb) continue;
    if (canonical(na, ignore) !== canonical(nb, ignore)) {
      changed.push(...diffItem(id, na, nb, ignore));
    }
  }

  const equal = added.length === 0 && removed.length === 0 && changed.length === 0;
  return { equal, added: added.sort(), removed: removed.sort(), changed };
}
