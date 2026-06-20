// Publish the FULL default KiCad symbol + footprint set to the CDN as
// version-pinned r2-idb-sync STATIC ORIGINS (one per lib), which the demo's
// cdnLibsSource opens read-only + IDB-cached (1 bundle cold, 0 warm). See
// docs/features/r2-idb-sync + wasm/libs/cdn-source.ts.
//
//   npx tsx scripts/deploy/publish-libs.ts --lib-tag 10.0.3 \
//     --symbols-src <kicad-symbols checkout> --footprints-src <kicad-footprints> \
//     --driver local --out /tmp/cdn-libs
//   npx tsx scripts/deploy/publish-libs.ts --lib-tag 10.0.3 --symbols-src … \
//     --footprints-src … --driver r2 --bucket pcbjam-cdn --remote
//
// Keyed by the upstream KiCad library tag (libs/kicad/<libTag>/), published ONCE
// per tag: if <prefix>/<libTag>/manifest.json already exists it SKIPS the whole
// run (override with --force) — so it's decoupled from the app/demo deploy.
//
// Per lib `<prefix>/<libTag>/<lib>/`:
//   manifest   SyncManifest { version, entries: { "<kind>/<name>": {hash,size,mtime} } }
//   bundle     encodeBundle(manifest, bodies)  — cold-init payload (all bodies)
// + top `<prefix>/<libTag>/manifest.json` { schema, tag, libs:[{id,name,kind,itemCount}] }
// All immutable (content is pinned by the tag).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractAllLibs } from "../../web/backend/src/extract/extract-libs.js";
import { encodeBundle, type SyncManifest } from "../../web/pcbjam-shared/src/sync-wire.js";
import { IMMUTABLE, makeStore, putJSON, sha256hex } from "./lib/cdn-store.mjs";

// Upstream KiCad library repos (full set lives here; tagged per KiCad release).
const SYMBOLS_URL = "https://gitlab.com/kicad/libraries/kicad-symbols.git";
const FOOTPRINTS_URL = "https://gitlab.com/kicad/libraries/kicad-footprints.git";

interface Args {
  libTag: string | null;
  symbolsSrc: string | null;
  footprintsSrc: string | null;
  clone: string | null;
  driver: string;
  out: string | null;
  bucket: string;
  remote: boolean;
  prefix: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    libTag: null,
    symbolsSrc: null,
    footprintsSrc: null,
    clone: null,
    driver: "local",
    out: null,
    bucket: "pcbjam-cdn",
    remote: false,
    prefix: "libs/kicad",
    force: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const next = () => argv[++i]!;
    switch (argv[i]) {
      case "--lib-tag": a.libTag = next(); break;
      case "--symbols-src": a.symbolsSrc = next(); break;
      case "--footprints-src": a.footprintsSrc = next(); break;
      // Clone both upstream repos at --lib-tag into <dir>/{kicad-symbols,
      // kicad-footprints} (full, shallow) and use them as the sources.
      case "--clone": a.clone = next(); break;
      case "--driver": a.driver = next(); break;
      case "--out": a.out = next(); break;
      case "--bucket": a.bucket = next(); break;
      case "--remote": a.remote = true; break;
      case "--prefix": a.prefix = next(); break;
      case "--force": a.force = true; break;
      default: throw new Error(`unknown arg: ${argv[i]}`);
    }
  }
  if (!a.libTag) throw new Error("--lib-tag <kicad library tag> is required");
  if (!a.symbolsSrc && !a.footprintsSrc && !a.clone)
    throw new Error("need --clone <dir>, or --symbols-src / --footprints-src");
  if (a.driver === "local" && !a.out) a.out = ".cdn-out";
  return a;
}

/** Shallow full clone of a lib repo at a tag (idempotent: skip if present). */
function cloneFull(url: string, dest: string, ref: string): void {
  if (existsSync(dest)) {
    console.log(`clone: ${dest} present — reusing`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  console.log(`clone: ${url} @ ${ref} → ${dest}`);
  execFileSync("git", ["clone", "--depth", "1", "--branch", ref, url, dest], {
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv);
  const store = makeStore(a.driver, a);
  const enc = new TextEncoder();
  const topKey = `${a.prefix}/${a.libTag}/manifest.json`;

  // Skip-if-exists: the snapshot is immutable + content-pinned by the tag.
  if (!a.force && store.getJSON(topKey)) {
    console.log(`publish-libs: ${topKey} already published — skipping (use --force)`);
    return;
  }

  console.log(`publish-libs: tag=${a.libTag} driver=${store.kind} → ${a.prefix}/${a.libTag}/`);

  // Source the full set from upstream when asked (CI path); --symbols-src /
  // --footprints-src still win if also given (local checkouts).
  if (a.clone) {
    const symDest = join(a.clone, "kicad-symbols");
    const fpDest = join(a.clone, "kicad-footprints");
    cloneFull(SYMBOLS_URL, symDest, a.libTag);
    cloneFull(FOOTPRINTS_URL, fpDest, a.libTag);
    a.symbolsSrc ??= symDest;
    a.footprintsSrc ??= fpDest;
  }

  const libs = await extractAllLibs({
    symbolsSrc: a.symbolsSrc ?? undefined,
    footprintsSrc: a.footprintsSrc ?? undefined,
  });

  const topLibs: Array<{ id: string; name: string; kind: string; itemCount: number }> = [];
  let totalItems = 0;
  for (const { lib, kind, items } of libs) {
    const bodies = items.map(
      (it): [string, Uint8Array] => [`${it.kind}/${it.name}`, enc.encode(it.body)],
    );
    const entries: SyncManifest["entries"] = {};
    for (const [path, body] of bodies) {
      entries[path] = { hash: sha256hex(body), size: body.length, mtime: 0 };
    }
    const manifest: SyncManifest = { version: 1, entries };
    const base = `${a.prefix}/${a.libTag}/${lib}`;
    putJSON(store, `${base}/manifest`, manifest, IMMUTABLE);
    store.put(`${base}/bundle`, encodeBundle(manifest, bodies), {
      contentType: "application/octet-stream",
      contentEncoding: null,
      cacheControl: IMMUTABLE,
    });
    topLibs.push({ id: lib, name: lib, kind, itemCount: items.length });
    totalItems += items.length;
  }

  topLibs.sort((x, y) => x.id.localeCompare(y.id));
  putJSON(store, topKey, { schema: 1, tag: a.libTag, libs: topLibs }, IMMUTABLE);

  console.log(
    `publish-libs: done — ${topLibs.length} libs, ${totalItems} items → ${topKey}`,
  );
  if (store.kind === "local") console.log(`local layout under: ${a.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
