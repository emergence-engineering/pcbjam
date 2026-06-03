// Bundle the collab browser entry (reconciler + Yjs + BroadcastChannel transport,
// sourced from the web frontend) into a single IIFE the pl_editor harness loads.
// nodePaths lets esbuild resolve `yjs` from tests/node_modules even though the
// reconciler lives under web/. Output: apps/kicad/collab-bundle.js (global KicadCollab).
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

await build({
  entryPoints: [path.join(testsDir, "collab/browser-entry.ts")],
  bundle: true,
  format: "iife",
  outfile: path.join(testsDir, "apps/kicad/collab-bundle.js"),
  nodePaths: [path.join(testsDir, "node_modules")],
  logLevel: "info",
  target: "es2020",
});

console.log("collab bundle built → apps/kicad/collab-bundle.js");
