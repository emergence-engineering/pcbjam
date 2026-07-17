#!/usr/bin/env node
// Build the standalone editor for PRODUCTION and serve it with `vite preview`
// — the server the web e2e suite runs against (playwright-web.config.ts), so
// the tests exercise the minified production bundle instead of the dev server.
//
//   node scripts/build-preview.mjs
//
// Steps:
//   1. link-wasm.mjs: sync output/ artifacts into tests/apps/kicad and (re)make
//      the public/wasm symlink — preview serves /wasm through it (vite.config's
//      serveWasm plugin), NOT from dist/.
//   2. `pnpm run build` at the web/ workspace root (turbo orders the workspace
//      deps: shared, sync-client, then standalone). The public/wasm symlink is
//      stashed aside during the build — same move as scripts/deploy/
//      build-demo.mjs — because vite would otherwise copy the whole artifact
//      tree (100s of MB) into dist/. VITE_* env must be set by the caller at
//      BUILD time (prod bundles bake them in; the dev server read them live).
//   3. exec `vite preview` as the persistent server (the playwright webServer
//      health-checks the URL and kills the process tree on teardown).

import { execFileSync, spawn } from "node:child_process";
import { existsSync, lstatSync, renameSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const standalone = path.resolve(scriptDir, "..");
const webRoot = path.resolve(standalone, "..");
const publicWasm = path.join(standalone, "public", "wasm");
const stash = path.join(standalone, "public", ".wasm.e2e-stashed");

const isLink = (p) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

// 1. Sync artifacts + (re)create the symlink.
execFileSync("node", [path.join(scriptDir, "link-wasm.mjs")], {
  stdio: "inherit",
});

// 2. Build with the symlink stashed out of public/ (restore even on failure —
// a dangling stash would make the next dev run serve nothing at /wasm).
const hadWasm = existsSync(publicWasm) || isLink(publicWasm);
if (hadWasm) renameSync(publicWasm, stash);
try {
  execFileSync("pnpm", ["run", "build"], { cwd: webRoot, stdio: "inherit" });
} finally {
  if (hadWasm) renameSync(stash, publicWasm);
}

// 3. Serve dist/ (vite.config preview: STANDALONE_PORT, strictPort, COOP/COEP;
// the serveWasm plugin provides /wasm from the restored symlink).
const preview = spawn("pnpm", ["exec", "vite", "preview"], {
  cwd: standalone,
  stdio: "inherit",
});
preview.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => preview.kill(sig));
}
