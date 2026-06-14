// Minimal reference libraries serving for the @pcbjam/shared libs contract.
//
// Serves PRE-BUILT self-contained symbol bodies from a directory (LIBS_DIR),
// laid out as:
//
//   <LIBS_DIR>/<LibName>/index.json          { items: [{kind,name,description,keywords}], ... }
//   <LIBS_DIR>/<LibName>/<Symbol>.kicad_sym  a complete kicad_symbol_lib s-expr
//   <LIBS_DIR>/<LibName>/LICENSE.md          attribution (CC-BY-SA travels with data)
//
// This backend does NO parsing — bodies are produced upstream (the closed
// ingestion/extractor) so the open reference server stays trivial. If LIBS_DIR
// is unset or empty, the lib endpoints simply report no libraries.

import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Lib, LibItem } from "@pcbjam/shared";

export interface LibsConfig {
  dir: string | null;
}

export function libsConfig(): LibsConfig {
  const dir = process.env.LIBS_DIR;
  return { dir: dir ? path.resolve(process.cwd(), dir) : null };
}

/** A lib id is its directory name; reject anything that isn't a plain segment. */
function safeLibDir(root: string, lib: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(lib)) return null;
  return path.join(root, lib);
}

/** Per-kind body file extension (one file per item), or null for unknown kinds. */
export function extForKind(kind: string): string | null {
  if (kind === "symbol") return ".kicad_sym";
  if (kind === "footprint") return ".kicad_mod";
  return null;
}

interface IndexFile {
  items?: { kind: string; name: string; description?: string | null; keywords?: string | null }[];
  description?: string | null;
}

async function readIndex(dir: string): Promise<IndexFile | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "index.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function listLibs(
  cfg: LibsConfig,
  kind?: string,
): Promise<Lib[]> {
  if (!cfg.dir) return [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(cfg.dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const libs: Lib[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const idx = await readIndex(path.join(cfg.dir, e.name));
    // Filter origins by item kind when requested (a footprint tool shouldn't
    // list symbol-only origins, and vice versa).
    if (kind && !(idx?.items ?? []).some((i) => i.kind === kind)) continue;
    libs.push({
      id: e.name,
      name: e.name,
      type: "origin",
      description: idx?.description ?? null,
      itemCount: idx?.items?.length ?? undefined,
    });
  }
  libs.sort((a, b) => a.name.localeCompare(b.name));
  return libs;
}

export async function listLibItems(
  cfg: LibsConfig,
  lib: string,
): Promise<LibItem[] | null> {
  if (!cfg.dir) return null;
  const dir = safeLibDir(cfg.dir, lib);
  if (!dir) return null;
  const idx = await readIndex(dir);
  if (!idx) return null;
  return (idx.items ?? []).map((i) => ({
    kind: i.kind,
    name: i.name,
    description: i.description ?? null,
    keywords: i.keywords ?? null,
  }));
}

/** Resolve the on-disk body file for one item, or null (guarded). */
export function itemBodyPath(
  cfg: LibsConfig,
  lib: string,
  kind: string,
  name: string,
): string | null {
  const ext = extForKind(kind);
  if (!cfg.dir || !ext) return null;
  const dir = safeLibDir(cfg.dir, lib);
  if (!dir) return null;
  // Item names allow a wide charset but never path separators.
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return null;
  }
  return path.join(dir, `${name}${ext}`);
}

export function streamBody(absPath: string) {
  return createReadStream(absPath);
}
