// Minimal reference WRITE support for the @pcbjam/shared lib protocol (0004).
//
// User libraries are created + written by the editor. The closed registry server
// stores them per-user in Postgres+R2; this open reference server keeps them as
// plain files under USER_LIBS_DIR, owner-namespaced, in the same per-lib layout
// the read side uses:
//
//   <USER_LIBS_DIR>/<owner>/<libId>/index.json          { items: [...], type, name }
//   <USER_LIBS_DIR>/<owner>/<libId>/<Symbol>.kicad_sym   the saved body (verbatim)
//
// No parsing: the editor sends fork-native kicad_symbol_lib bytes, stored as-is
// (decision: user-saved bodies round-trip without a version shim). Owner comes
// from OWNER_HEADER; absent ⇒ "default".

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Lib, LibItem } from "@pcbjam/shared";

export const DEFAULT_OWNER = "default";

export interface UserLibsConfig {
  /** Root for owner-namespaced writable user libs; null ⇒ writes disabled. */
  dir: string | null;
}

export function userLibsConfig(): UserLibsConfig {
  const dir = process.env.USER_LIBS_DIR ?? ".user-libs";
  return { dir: path.resolve(process.cwd(), dir) };
}

/** A safe path segment (owner slug, lib id, item name component). */
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

function safeSeg(s: string): string | null {
  return SAFE.test(s) ? s : null;
}

/** Derive a stable, filesystem-safe lib id from a display name. */
export function slugifyLibName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._+-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "lib";
}

interface IndexFile {
  type?: string;
  name?: string;
  description?: string | null;
  items?: {
    kind: string;
    name: string;
    description?: string | null;
    keywords?: string | null;
  }[];
}

function libDir(cfg: UserLibsConfig, owner: string, lib: string): string | null {
  if (!cfg.dir) return null;
  const o = safeSeg(owner);
  const l = safeSeg(lib);
  if (!o || !l) return null;
  return path.join(cfg.dir, o, l);
}

async function readIndex(dir: string): Promise<IndexFile | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, "index.json"), "utf8"));
  } catch {
    return null;
  }
}

async function writeIndex(dir: string, idx: IndexFile): Promise<void> {
  await fs.writeFile(path.join(dir, "index.json"), JSON.stringify(idx, null, 2));
}

export class UserLibError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** Create a user lib for an owner. Idempotent-ish: 409 if the id already exists. */
export async function createUserLib(
  cfg: UserLibsConfig,
  owner: string,
  name: string,
): Promise<Lib> {
  const id = slugifyLibName(name);
  const dir = libDir(cfg, owner, id);
  if (!dir) throw new UserLibError(400, "user libs not configured or bad name");
  if (await readIndex(dir)) {
    throw new UserLibError(409, `library "${id}" already exists`);
  }
  await fs.mkdir(dir, { recursive: true });
  const idx: IndexFile = { type: "user", name, description: null, items: [] };
  await writeIndex(dir, idx);
  return { id, name, type: "user", description: null, itemCount: 0 };
}

/** List an owner's user libs. */
export async function listUserLibs(
  cfg: UserLibsConfig,
  owner: string,
): Promise<Lib[]> {
  const o = cfg.dir && safeSeg(owner);
  if (!cfg.dir || !o) return [];
  const root = path.join(cfg.dir, o);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Lib[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const idx = await readIndex(path.join(root, e.name));
    if (!idx) continue;
    out.push({
      id: e.name,
      name: idx.name ?? e.name,
      type: "user",
      description: idx.description ?? null,
      itemCount: idx.items?.length ?? 0,
    });
  }
  return out;
}

/** List a user lib's items, or null if the lib isn't a user lib for this owner. */
export async function listUserItems(
  cfg: UserLibsConfig,
  owner: string,
  lib: string,
): Promise<LibItem[] | null> {
  const dir = libDir(cfg, owner, lib);
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

/** Resolve the on-disk body path for a user item (read), or null. */
export function userItemBodyPath(
  cfg: UserLibsConfig,
  owner: string,
  lib: string,
  kind: string,
  name: string,
): string | null {
  const dir = libDir(cfg, owner, lib);
  if (!dir || kind !== "symbol" || !safeSeg(name)) return null;
  return path.join(dir, `${name}.kicad_sym`);
}

/** Write one symbol body into a user lib + index it. */
export async function writeUserItem(
  cfg: UserLibsConfig,
  owner: string,
  lib: string,
  kind: string,
  name: string,
  body: string,
): Promise<LibItem> {
  if (kind !== "symbol") throw new UserLibError(400, "only symbols for now");
  const dir = libDir(cfg, owner, lib);
  if (!dir || !safeSeg(name)) throw new UserLibError(400, "bad lib or item name");
  const idx = await readIndex(dir);
  if (!idx) throw new UserLibError(404, `user library "${lib}" not found`);

  await fs.writeFile(path.join(dir, `${name}.kicad_sym`), body, "utf8");

  const items = idx.items ?? [];
  const existing = items.find((i) => i.kind === kind && i.name === name);
  if (!existing) items.push({ kind, name });
  idx.items = items;
  await writeIndex(dir, idx);

  return { kind, name, description: null, keywords: null };
}
