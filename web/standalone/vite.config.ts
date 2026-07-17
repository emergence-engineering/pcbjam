import * as fs from "node:fs";
import * as path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Serve /wasm assets from public/wasm (the link-wasm.mjs symlink) in BOTH the
 * dev server and `vite preview`.
 *
 * Dev: only `.gz` needs help. Vite's static (sirv) sets
 * `Content-Encoding: gzip` for `.gz` files; the browser then transparently
 * decompresses the response, so the harness's `fetch('images.tar.gz')`
 * receives the DECOMPRESSED tar — and KiCad's gunzip of it fails with "Can't
 * read from inflate stream: incorrect header check". We must hand the browser
 * the raw gzip bytes, so we serve them ourselves with no Content-Encoding.
 * Runs before the public-dir middleware.
 *
 * Preview: dist/ deliberately contains NO wasm (build-preview.mjs stashes the
 * public/wasm symlink aside during the build, same as build-demo.mjs — it
 * would copy 100s of MB into dist/), so preview serves ALL of /wasm/* from
 * the symlink path here, with the same raw-.gz rule. Same-origin, so COEP
 * needs no extra headers on these responses.
 */
function serveWasm(): Plugin {
  const publicDir = path.resolve(__dirname, "public");
  const MIME: Record<string, string> = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".map": "application/json",
    ".html": "text/html",
    ".data": "application/octet-stream",
    ".gz": "application/octet-stream",
  };
  const serve = (
    req: { url?: string },
    res: import("node:http").ServerResponse,
    next: () => void,
    opts: { gzOnly: boolean },
  ) => {
    const url = req.url?.split("?")[0] ?? "";
    if (!url.startsWith("/wasm/")) return next();
    const isGz = /\.gz$/.test(url);
    if (opts.gzOnly && !isGz) return next();
    const filePath = path.join(publicDir, decodeURIComponent(url));
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) return next();
      const type = MIME[path.extname(filePath)] ?? "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.setHeader("Content-Length", st.size);
      // This middleware short-circuits BEFORE vite applies server/preview
      // `headers`, so it must emit the cross-origin-isolation set itself:
      // kicad_editor.js doubles as the pthread WORKER script, and under
      // COEP:require-corp a worker script's response must itself carry COEP —
      // without it Chrome kills the load with net::ERR_BLOCKED_BY_RESPONSE
      // and the editor never boots.
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      // Intentionally NO Content-Encoding for .gz so fetch() yields raw bytes.
      fs.createReadStream(filePath).pipe(res);
    });
  };
  return {
    name: "serve-wasm",
    configureServer(server) {
      // Dev: sirv serves public/ fine except the .gz encoding quirk.
      server.middlewares.use((req, res, next) => serve(req, res, next, { gzOnly: true }));
    },
    configurePreviewServer(server) {
      // Preview: dist has no wasm at all — serve the whole subtree.
      server.middlewares.use((req, res, next) => serve(req, res, next, { gzOnly: false }));
    },
  };
}

export default defineConfig({
  plugins: [serveWasm(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // @pcbjam/shared is in a second pnpm workspace with its own `yjs`; dedupe so
    // the bundled editor links ONE yjs (a mutable, instanceof-checked singleton).
    // Without it shared's collab code (kicad-y) and the app's yjs are two
    // instances → "Unexpected content type" the moment a doc is seeded.
    dedupe: ["yjs"],
  },
  server: {
    // Default :3048. The closed `pnpm dev:gpl` runs a second editor instance on
    // :3049 (alongside the closed stack) via STANDALONE_PORT. strictPort so a
    // busy port fails loudly instead of drifting onto another service's port.
    port: Number(process.env.STANDALONE_PORT) || 3048,
    strictPort: true,
    // KiCad WASM is cross-origin-isolated (COOP/COEP); same-origin /wasm assets
    // load fine. Keep these so SharedArrayBuffer/threads are available.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    // Same port contract as the dev server (STANDALONE_PORT override,
    // strictPort) so the e2e webServer/health-check URL is identical in both
    // modes. Vite's preview default (4173) would silently strand the suite.
    port: Number(process.env.STANDALONE_PORT) || 3048,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
