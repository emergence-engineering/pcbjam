#!/usr/bin/env node
// Publish the KiCad WASM artifacts to the versioned CDN (cdn.pcbjam.com, R2
// `pcbjam-cdn`). Implements docs/features/demo-deploy/0001-wasm-cdn-versioning.md:
// per-tool, content-addressed, self-contained folders + a per-release manifest
// the standalone reads at runtime, with a `registry.json` for hash-dedupe.
//
//   node scripts/publish-wasm.mjs --tag 2.7.7 --src pcbjam/output --driver local --out /tmp/cdn
//   node scripts/publish-wasm.mjs --tag 2.7.7 --src pcbjam/output --driver r2 --bucket pcbjam-cdn --remote
//
// Properties (see 0001): ONE atomic job; idempotent; content-addressed folders
// are immutable; meta.json is written LAST as the completeness marker; an
// unchanged tool is never re-uploaded; the build↔upload race is impossible.
//
// The `local` driver writes the exact bucket layout to --out (+ a sidecar
// `_uploads.json` recording every object's HTTP metadata) so the whole thing is
// verifiable offline. The `r2` driver shells `wrangler r2 object {get,put}` and
// needs only CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compressBytes,
  IMMUTABLE,
  makeStore,
  NO_STORE,
  putJSON,
  sha256hex,
} from "./lib/cdn-store.mjs";

// --- tools & per-file rules ---------------------------------------------------

// Bundles served to the browser editor. symbol_editor / footprint_editor are NOT
// separate bundles: they are the eeschema / pcbnew bundle booted with a runtime
// --frame flag (editor-unification), so they publish nothing of their own. The
// frontend maps them onto their parent bundle via TOOL_BUNDLE. sym_convert is a
// node CLI, not served.
const TOOLS = [
  "pcbnew",
  "eeschema",
  "pl_editor",
  "gerbview",
  "calculator",
];

// Files that make up a self-contained tool bundle. `<tool>` is substituted.
const SHARED_FILES = ["wx.js", "wx-dom.js", "images.tar.gz"];
const toolFiles = (tool) => [`${tool}.wasm`, `${tool}.js`, ...SHARED_FILES];

// Per-file HTTP rules (see the 0001 header matrix). `compress` is whether the
// publisher compresses + sets Content-Encoding; images.tar.gz must stay RAW
// gzip (KiCad gunzips it in JS) so it is octet-stream with NO encoding.
function fileRule(name) {
  if (name.endsWith(".wasm"))
    return { contentType: "application/wasm", compress: true, cacheControl: IMMUTABLE };
  if (name.endsWith(".js"))
    return { contentType: "text/javascript", compress: true, cacheControl: IMMUTABLE };
  if (name === "images.tar.gz")
    return { contentType: "application/octet-stream", compress: false, cacheControl: IMMUTABLE };
  if (name.endsWith(".json"))
    return { contentType: "application/json", compress: false, cacheControl: IMMUTABLE };
  return { contentType: "application/octet-stream", compress: false, cacheControl: IMMUTABLE };
}

// --- args ---------------------------------------------------------------------

function parseArgs(argv) {
  const a = {
    tag: null,
    src: "output",
    driver: "local",
    out: null,
    bucket: "pcbjam-cdn",
    remote: false,
    compress: "gzip", // gzip | br | none
    quality: null,
    tools: TOOLS,
    prefix: "wasm",
    builtAt: process.env.SOURCE_DATE || null,
    // Snapshot mode: write manifest-<tag>.json pinning the CURRENT registry
    // versions, with NO build/upload (the tag deploy reuses prebuilt WASM).
    fromRegistry: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    switch (k) {
      case "--tag": a.tag = next(); break;
      case "--src": a.src = next(); break;
      case "--driver": a.driver = next(); break;
      case "--out": a.out = next(); break;
      case "--bucket": a.bucket = next(); break;
      case "--remote": a.remote = true; break;
      case "--compress": a.compress = next(); break;
      case "--quality": a.quality = Number(next()); break;
      case "--tools": a.tools = next().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--prefix": a.prefix = next(); break;
      case "--from-registry": a.fromRegistry = true; break;
      default: throw new Error(`unknown arg: ${k}`);
    }
  }
  if (!a.tag) throw new Error("--tag <release tag> is required");
  if (a.driver === "local" && !a.out) a.out = ".cdn-out";
  if (a.compress !== "gzip" && a.compress !== "br" && a.compress !== "none")
    throw new Error(`--compress must be gzip|br|none (got ${a.compress})`);
  return a;
}

// --- tool identity ------------------------------------------------------------

// Identity of a tool = sha256 over the sorted (name: sha256(uncompressed bytes))
// of its bundle files. Hash the SOURCE bytes, never the compressed upload, so
// changing the compression level can never change a tool's version.
function toolContentHash(files) {
  const lines = files
    .map((f) => `${f.name}:${sha256hex(f.bytes)}`)
    .sort();
  return "sha256:" + sha256hex(Buffer.from(lines.join("\n")));
}

// --- publish ------------------------------------------------------------------

function gather(tool, srcDir) {
  return toolFiles(tool).map((name) => {
    const p = join(srcDir, name);
    if (!existsSync(p)) throw new Error(`missing artifact: ${p}`);
    return { name, bytes: readFileSync(p) };
  });
}

function putFile(store, key, bytes, name, compress, quality) {
  const rule = fileRule(name);
  let body = bytes;
  let encoding = null;
  if (rule.compress && compress !== "none") {
    const c = compressBytes(bytes, compress, quality);
    body = c.bytes;
    encoding = c.encoding;
  }
  store.put(key, body, {
    contentType: rule.contentType,
    contentEncoding: encoding,
    cacheControl: rule.cacheControl,
  });
  return { name, raw: bytes.length, stored: body.length, encoding };
}

function main() {
  const a = parseArgs(process.argv);
  const builtAt = a.builtAt || new Date().toISOString();
  const store = makeStore(a.driver, a);
  const P = a.prefix;

  const registry = store.getJSON(`${P}/registry.json`) || {
    schema: 1,
    tools: {},
    index: {},
  };
  registry.index ||= {};
  registry.tools ||= {};

  const manifest = { schema: 1, tag: a.tag, builtAt, tools: {} };

  // Snapshot mode (the tag deploy): pin manifest-<tag> to the CURRENT published
  // per-tool versions and STOP — no build, no upload. Honors "reuse prebuilt":
  // app releases that didn't change the WASM never re-touch the WASM blobs.
  if (a.fromRegistry) {
    for (const tool of a.tools) {
      const entry = registry.tools[tool];
      if (!entry)
        throw new Error(
          `tool "${tool}" not in ${P}/registry.json — publish the WASM (full ` +
            `mode) before snapshotting a release manifest`,
        );
      manifest.tools[tool] = entry.version;
    }
    putJSON(store, `${P}/manifest-${a.tag}.json`, manifest, NO_STORE);
    console.log(
      `snapshot: manifest-${a.tag}.json ← registry (${a.tools.length} tools, no upload)`,
    );
    return;
  }

  console.log(
    `publish-wasm: tag=${a.tag} src=${a.src} driver=${store.kind} compress=${a.compress}`,
  );

  let uploaded = 0;
  let reused = 0;

  for (const tool of a.tools) {
    const files = gather(tool, a.src);
    const hash = toolContentHash(files);
    const idx = (registry.index[tool] ||= {});

    let ver = idx[hash];
    if (ver) {
      reused++;
      console.log(`  ${tool}: reuse ${ver} (${hash.slice(0, 19)}…)`);
    } else {
      ver = a.tag;
      const metaKey = `${P}/${tool}/${ver}/meta.json`;
      const existing = store.getJSON(metaKey)?.hash ?? null;
      if (existing && existing !== hash) {
        throw new Error(
          `moved-tag guard: ${P}/${tool}/${ver}/ already holds ${existing} ` +
            `but this build is ${hash}. Re-tag with a NEW version, never ` +
            `overwrite an immutable folder.`,
        );
      }
      const sizes = [];
      for (const f of files) {
        const key = `${P}/${tool}/${ver}/${f.name}`;
        sizes.push(putFile(store, key, f.bytes, f.name, a.compress, a.quality));
      }
      // meta.json LAST — its presence marks the bundle complete.
      putJSON(
        store,
        metaKey,
        {
          tool,
          ver,
          hash,
          builtAt,
          files: Object.fromEntries(files.map((f) => [f.name, "sha256:" + sha256hex(f.bytes)])),
        },
        IMMUTABLE,
      );
      idx[hash] = ver;
      uploaded++;
      const tot = sizes.reduce((s, x) => s + x.stored, 0);
      console.log(
        `  ${tool}: UPLOAD ${ver} (${hash.slice(0, 19)}…) ` +
          `${(tot / 1e6).toFixed(1)}MB stored`,
      );
    }
    registry.tools[tool] = { version: ver, hash };
    manifest.tools[tool] = ver;
  }

  // Browser-facing manifest + convenience pointer, both uncached.
  putJSON(store, `${P}/manifest-${a.tag}.json`, manifest, NO_STORE);
  putJSON(store, `${P}/manifest-latest.json`, { tag: a.tag }, NO_STORE);
  // registry LAST, after every tool's meta.json exists.
  putJSON(store, `${P}/registry.json`, registry, NO_STORE);

  console.log(
    `done: ${uploaded} uploaded, ${reused} reused → manifest-${a.tag}.json`,
  );
  if (store.kind === "local") console.log(`local layout under: ${a.out}`);
}

main();
