import * as fs from "node:fs";
import * as path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Serve /wasm/*.gz as opaque bytes WITHOUT `Content-Encoding: gzip`.
 *
 * Vite's static (sirv) sets `Content-Encoding: gzip` for `.gz` files. The
 * browser then transparently decompresses the response, so the harness's
 * `fetch('images.tar.gz')` receives the DECOMPRESSED tar — and KiCad's gunzip
 * of it fails with "Can't read from inflate stream: incorrect header check".
 * We must hand the browser the raw gzip bytes, so we serve them ourselves with
 * no Content-Encoding. Runs before the public-dir middleware.
 */
function serveWasmGzRaw(): Plugin {
  const publicDir = path.resolve(__dirname, "public");
  return {
    name: "serve-wasm-gz-raw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!/^\/wasm\/.+\.gz$/.test(url)) return next();
        const filePath = path.join(publicDir, decodeURIComponent(url));
        fs.stat(filePath, (err, st) => {
          if (err || !st.isFile()) return next();
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Content-Length", st.size);
          // Intentionally NO Content-Encoding so fetch() yields raw gzip bytes.
          fs.createReadStream(filePath).pipe(res);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [serveWasmGzRaw(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
