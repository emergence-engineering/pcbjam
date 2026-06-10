import path from "node:path";
import { defineConfig } from "vitest/config";

// Standalone unit-test config, intentionally separate from vite.config.ts so the
// test run doesn't pull in the React plugin / WASM-asset dev server. Pure-logic
// modules (e.g. the sexpr-diff comparator) run in the node environment.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
