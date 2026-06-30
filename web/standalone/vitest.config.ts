import path from "node:path";
import { defineConfig } from "vitest/config";

// Standalone unit-test config, intentionally separate from vite.config.ts so the
// test run doesn't pull in the React plugin / WASM-asset dev server. Pure-logic
// modules (e.g. the sexpr-diff comparator) run in the node environment.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    // @pcbjam/shared lives in a second pnpm workspace, so without this its `yjs`
    // and the standalone's `yjs` resolve to two physical copies → a Y.Map from
    // one instance rejects Y types from the other ("Unexpected content type").
    // Force a single yjs (it's a shared mutable singleton — instanceof-checked).
    dedupe: ["yjs"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
