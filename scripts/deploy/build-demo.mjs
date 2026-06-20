#!/usr/bin/env node
// Build the GPL standalone for the no-backend demo (demo.pcbjam.com): pin it to
// the CDN WASM root + this tag's manifests + the static gallery, run the vite
// build, and drop the Cloudflare Pages _headers/_redirects into dist/. The
// resulting pcbjam/web/standalone/dist/ is what `wrangler pages deploy` ships.
// See docs/features/demo-deploy/ (P4).
//
//   node scripts/build-demo.mjs --tag 2.7.7 [--cdn https://cdn.pcbjam.com]
//
// WASM + example bytes come from the CDN at runtime, so the local public/wasm
// symlink (dev only) is kept OUT of the bundle (temporarily moved aside during
// the build; in CI it doesn't exist at all).

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const a = {
    tag: null,
    cdn: "https://cdn.pcbjam.com",
    repo: "https://github.com/emergence-engineering/pcbjam",
  };
  for (let i = 2; i < argv.length; i++) {
    const next = () => argv[++i];
    switch (argv[i]) {
      case "--tag": a.tag = next(); break;
      case "--cdn": a.cdn = next(); break;
      case "--repo": a.repo = next(); break;
      default: throw new Error(`unknown arg: ${argv[i]}`);
    }
  }
  if (!a.tag) throw new Error("--tag <release tag> is required");
  a.cdn = a.cdn.replace(/\/+$/, "");
  a.repo = a.repo.replace(/\/+$/, "");
  return a;
}

// Best-effort source commit for the version badge's corresponding-source link;
// empty string if git isn't available (CI shallow checkout etc.) — the badge
// then falls back to the tag's release page.
function gitSha(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function main() {
  const a = parseArgs(process.argv);
  const repoRoot = resolve(process.cwd());
  const standalone = join(repoRoot, "web/standalone");
  const dist = join(standalone, "dist");
  const publicWasm = join(standalone, "public/wasm");
  const stash = join(standalone, "public/.wasm.demo-stashed");

  const env = {
    ...process.env,
    // Versioned CDN: each tool resolves to wasm/<tool>/<ver>/ via this manifest.
    VITE_WASM_ROOT: `${a.cdn}/wasm`,
    VITE_WASM_MANIFEST: `manifest-${a.tag}.json`,
    // Read-only example gallery, saves download to local.
    VITE_PROJECT_SOURCE: "static",
    VITE_PROJECT_MANIFEST_URL: `${a.cdn}/content/${a.tag}/manifest.json`,
    // Loaded folders import into a browser-local (IndexedDB) project — editable,
    // persistent, exported via Download .zip — layered over the gallery.
    VITE_LOCAL_PROJECTS: "idb",
    // Built-in offline symbols (no backend); cross-tab collab only.
    VITE_LIBS_SOURCE: "static",
    VITE_YJS_PROVIDER: "broadcastchannel",
    // Build identity for the version badge. The commit is the GPLv3
    // corresponding-source pointer (pins the kicad + wxwidgets submodules).
    VITE_APP_TAG: a.tag,
    VITE_GIT_SHA: gitSha(repoRoot),
    VITE_REPO_URL: a.repo,
  };

  console.log(`build-demo: tag=${a.tag} cdn=${a.cdn}`);
  console.log(`  VITE_WASM_ROOT=${env.VITE_WASM_ROOT}`);
  console.log(`  VITE_WASM_MANIFEST=${env.VITE_WASM_MANIFEST}`);
  console.log(`  VITE_PROJECT_MANIFEST_URL=${env.VITE_PROJECT_MANIFEST_URL}`);
  console.log(`  VITE_APP_TAG=${env.VITE_APP_TAG} VITE_GIT_SHA=${env.VITE_GIT_SHA || "(none)"}`);

  // Keep the dev-only WASM symlink out of the bundle (it'd copy 100s of MB into
  // dist/; the CDN serves it). In CI it isn't present, so this is a no-op there.
  const hadWasm = existsSync(publicWasm) || isSymlink(publicWasm);
  if (hadWasm) renameSync(publicWasm, stash);
  try {
    execFileSync(
      "pnpm",
      ["--dir", "web", "--filter", "@pcbjam/standalone", "build"],
      { cwd: repoRoot, env, stdio: "inherit" },
    );
  } finally {
    if (hadWasm) renameSync(stash, publicWasm);
  }

  // Belt-and-suspenders: never ship local wasm even if a copy slipped through.
  rmSync(join(dist, "wasm"), { recursive: true, force: true });

  for (const f of ["_headers", "_redirects"]) {
    copyFileSync(join(repoRoot, "deploy/demo", f), join(dist, f));
  }

  console.log(`done → ${dist} (ready for: wrangler pages deploy)`);
}

function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

main();
