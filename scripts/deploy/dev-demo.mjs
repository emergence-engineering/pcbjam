#!/usr/bin/env node
// Run the GPL standalone editor LOCALLY in "demo mode" — the no-backend
// configuration of demo.pcbjam.com, but served by the Vite dev server so you can
// exercise a local WASM build against the live R2 CDN. This is the dev sibling of
// scripts/deploy/build-demo.mjs (which produces the static dist/ for deploy).
//
//   node scripts/deploy/dev-demo.mjs [--lib-tag 10.0.3] [--cdn https://cdn.pcbjam.com]
//                                    [--wasm local|r2] [--wasm-tag <tag>]
//                                    [--content-tag <tag>] [--port 5173]
//
// "Demo mode" = R2 is the only remote backend; there is NO REST API and NO
// partykit collab server:
//   - LIBRARIES come from the versioned R2 CDN (VITE_LIBS_SOURCE=cdn), read-only
//     and IDB-cached. This is the path the lazy/fat lib-load work targets.
//   - COLLAB is broadcastchannel (cross-tab only, no server) instead of partykit.
//   - PROJECTS: the static gallery (content/<tag>/) is only used when --content-tag
//     is given AND that tag is deployed. Otherwise projects are local-folder loads
//     persisted to a browser-local (IndexedDB) store — no backend needed.
//   - WASM defaults to the LOCAL freshly-built artifacts (served same-origin at
//     /wasm via scripts/link-wasm.mjs), so you test the editor you just built.
//     Pass --wasm r2 to pull the editor binaries from the live CDN instead.
//
// Note (2026-06-25): on the live CDN, libs/kicad/10.0.3/ is deployed but the
// content gallery (content/<tag>/) and a real wasm manifest are NOT — so the
// useful default is "live R2 libs + local WASM + local/IDB projects".

import { execFileSync, spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// repoRoot is two levels up from scripts/deploy/, independent of cwd.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Build the read-only example gallery (deploy/demo/gallery.json → the same
// "Demo Board" the live demo.pcbjam.com ships) into a local CDN layout and
// symlink it under the standalone's public/ so Vite serves it same-origin at
// /content/<tag>/. Mirrors what publish-content.mjs ships to the R2 CDN, but
// needs no deploy. Returns the (relative, same-origin) manifest URL.
function buildLocalGallery(repoRoot, tag) {
  const out = join(repoRoot, "web/standalone/.demo-cdn");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  execFileSync(
    "node",
    [
      join(repoRoot, "scripts/deploy/publish-content.mjs"),
      "--tag", tag,
      "--driver", "local",
      "--out", out,
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );
  // Serve <out>/content same-origin at /content via a public/ symlink (like
  // link-wasm does for /wasm). No bytes are copied into the bundle.
  const link = join(repoRoot, "web/standalone/public/content");
  try {
    if (lstatSync(link)) rmSync(link, { recursive: true, force: true });
  } catch {
    /* no existing link */
  }
  symlinkSync(join(out, "content"), link);
  return `/content/${tag}/manifest.json`;
}

function parseArgs(argv) {
  const a = {
    cdn: "https://cdn.pcbjam.com",
    libTag: "10.0.3", // live KiCad library snapshot on R2
    wasm: "local", // local | r2
    wasmTag: null, // manifest-<tag>.json when --wasm r2 (default: "latest")
    contentTag: null, // use the live CDN gallery for this tag (else build locally)
    galleryTag: "demo-local", // path tag for the locally-built gallery
    noGallery: false, // disable the example gallery (local-folder + IDB only)
    port: null,
    repo: "https://github.com/emergence-engineering/pcbjam",
  };
  for (let i = 2; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--cdn": a.cdn = next(); break;
      case "--lib-tag": a.libTag = next(); break;
      case "--wasm": a.wasm = next(); break;
      case "--wasm-tag": a.wasmTag = next(); break;
      case "--content-tag": a.contentTag = next(); break;
      case "--gallery-tag": a.galleryTag = next(); break;
      case "--no-gallery": a.noGallery = true; break;
      case "--port": a.port = next(); break;
      case "--repo": a.repo = next(); break;
      case "-h": case "--help": a.help = true; break;
      default: throw new Error(`unknown arg: ${argv[i]}`);
    }
  }
  a.cdn = a.cdn.replace(/\/+$/, "");
  if (a.wasm !== "local" && a.wasm !== "r2")
    throw new Error(`--wasm must be "local" or "r2" (got "${a.wasm}")`);
  return a;
}

const HELP = `dev-demo.mjs — run the standalone locally in demo mode (R2-only backend)

  node scripts/deploy/dev-demo.mjs [options]

  --lib-tag <tag>      KiCad lib snapshot on the CDN (default 10.0.3; "" disables → offline example libs)
  --cdn <url>          CDN origin (default https://cdn.pcbjam.com)
  --wasm local|r2      editor binaries: local fresh build (default) or live CDN
  --wasm-tag <tag>     wasm manifest tag for --wasm r2 (default "latest" → manifest-latest.json)
  --content-tag <tag>  pin the LIVE CDN gallery for this release tag (default: build+serve the gallery locally)
  --gallery-tag <tag>  path tag for the locally-built gallery (default demo-local)
  --no-gallery         disable the example gallery (local-folder + IDB projects only)
  --port <n>           dev server port

By default the read-only example gallery (deploy/demo/gallery.json) is built
locally and served same-origin at /content/<gallery-tag>/ — the home page shows
the "Demo Board" example, opened read-only (Save downloads to local).
`;

function gitSha(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd }).toString().trim();
  } catch {
    return "";
  }
}

function main() {
  const a = parseArgs(process.argv);
  if (a.help) {
    process.stdout.write(HELP);
    return;
  }
  const repoRoot = REPO_ROOT;

  const env = { ...process.env };

  // --- Libraries: live R2 CDN (the lazy/fat lib-load path), or offline examples.
  if (a.libTag) {
    env.VITE_LIBS_SOURCE = "cdn";
    env.VITE_LIBS_MANIFEST_URL = `${a.cdn}/libs/kicad/${a.libTag}/manifest.json`;
  } else {
    env.VITE_LIBS_SOURCE = "static";
    delete env.VITE_LIBS_MANIFEST_URL;
  }

  // --- No backend: collab is cross-tab only, document bytes are local (api path),
  //     loaded folders persist to a browser-local IndexedDB project.
  env.VITE_YJS_PROVIDER = "broadcastchannel";
  delete env.VITE_YJS_ENDPOINT;
  delete env.VITE_YJS_TOKEN;
  env.VITE_DOC_SOURCE = "api";
  env.VITE_LOCAL_PROJECTS = "idb";

  // --- Projects: the read-only example gallery (the demo.pcbjam.com experience).
  //     Default: build it locally and serve it same-origin. --content-tag <tag>
  //     pins the live CDN gallery instead. --no-gallery falls back to local-folder
  //     + IDB only. Either way the REST base points at a dead host so the home
  //     page never waits on a backend.
  if (a.noGallery) {
    env.VITE_PROJECT_SOURCE = "remote";
    delete env.VITE_PROJECT_MANIFEST_URL;
  } else if (a.contentTag) {
    env.VITE_PROJECT_SOURCE = "static";
    env.VITE_PROJECT_MANIFEST_URL = `${a.cdn}/content/${a.contentTag}/manifest.json`;
  } else {
    env.VITE_PROJECT_SOURCE = "static";
    env.VITE_PROJECT_MANIFEST_URL = buildLocalGallery(repoRoot, a.galleryTag);
  }
  env.VITE_API_BASE_URL = "http://offline.invalid"; // never resolves → local-folder loader

  // --- WASM: local fresh build (served at /wasm) or the live CDN.
  if (a.wasm === "r2") {
    env.VITE_WASM_ROOT = `${a.cdn}/wasm`;
    env.VITE_WASM_MANIFEST = `manifest-${a.wasmTag ?? "latest"}.json`;
  } else {
    env.VITE_WASM_ROOT = "/wasm";
    delete env.VITE_WASM_MANIFEST;
    delete env.VITE_WASM_ASSET_BASE_URL;
  }

  // --- Version badge identity (GPLv3 corresponding-source pointer).
  env.VITE_APP_TAG = env.VITE_APP_TAG || (a.contentTag ?? "demo-local");
  env.VITE_GIT_SHA = env.VITE_GIT_SHA || gitSha(repoRoot);
  env.VITE_REPO_URL = a.repo;

  const viteArgs = ["--dir", "web", "--filter", "@pcbjam/standalone", "dev"];
  if (a.port) viteArgs.push("--", "--port", String(a.port));

  console.log("dev-demo: standalone in demo mode (R2-only backend, no partykit)");
  console.log(`  VITE_LIBS_SOURCE=${env.VITE_LIBS_SOURCE}${env.VITE_LIBS_MANIFEST_URL ? ` (${env.VITE_LIBS_MANIFEST_URL})` : ""}`);
  console.log(`  VITE_WASM_ROOT=${env.VITE_WASM_ROOT}${env.VITE_WASM_MANIFEST ? ` (${env.VITE_WASM_MANIFEST})` : " (local build)"}`);
  console.log(`  VITE_PROJECT_SOURCE=${env.VITE_PROJECT_SOURCE}${env.VITE_PROJECT_MANIFEST_URL ? ` (${env.VITE_PROJECT_MANIFEST_URL})` : ""}`);
  console.log(`  VITE_YJS_PROVIDER=${env.VITE_YJS_PROVIDER}  VITE_DOC_SOURCE=${env.VITE_DOC_SOURCE}  VITE_LOCAL_PROJECTS=${env.VITE_LOCAL_PROJECTS}`);

  const child = spawn("pnpm", viteArgs, { cwd: repoRoot, env, stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

main();
