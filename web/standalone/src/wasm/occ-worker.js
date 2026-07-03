/*
 * Worker-side wrapper for the occ_service MODULARIZE module — the SINGLE
 * source of truth for the worker boot, shared verbatim by:
 *   - the standalone app provider (occ-service.ts, vite `?raw` import), and
 *   - the e2e harness stub (tests/kicad/utils/occ-service.ts, read off disk).
 *
 * The host prepends one prelude line to the blob before this file's content:
 *   self.OCC_GLUE_URL = "<absolute URL of occ_service.js>";
 *
 * Protocol: the host posts { id, req } (req = { kind: "export" | "loadModel",
 * … }); the worker answers { id, res } with the result bytes transferred. A
 * one-shot { ready: true } / { bootError } message reports module boot.
 */
const GLUE = self.OCC_GLUE_URL;

self.addEventListener("error", (e) =>
  console.error("[occ_service] worker error:", e.message, e.filename, e.lineno));
self.addEventListener("unhandledrejection", (e) =>
  console.error("[occ_service] unhandled rejection:", e.reason));

importScripts(GLUE);

// wx boot logs a "Debug:" line per image handler etc. — pure noise in the page
// console (and in the captured test logs); real problems don't carry the marker.
const noise = (s) => /(^|: )Debug: /.test(String(s));

const modP = OccService({
  onAbort: (what) => console.error("[occ_service] ABORT:", what),
  // The module's own pthread children must boot from a same-origin script even
  // when the glue lives on a CDN — same blob-importScripts trick as boot.ts.
  mainScriptUrlOrBlob: new Blob(
    ["importScripts(" + JSON.stringify(GLUE) + ");"],
    { type: "text/javascript" }),
  // A blob: worker has no http base URL — every asset path must be absolutized
  // against the glue's own URL or the .wasm fetch dies with "Failed to parse
  // URL" (root-relative bases like "/wasm" don't resolve).
  locateFile: (f) => new URL(f, GLUE).href,
  print: (s) => { if (!noise(s)) console.log("[occ_service]", s); },
  printErr: (s) => { if (!noise(s)) console.warn("[occ_service]", s); },
});

modP.then(() => postMessage({ ready: true }),
          (e) => postMessage({ bootError: String(e) }));

onmessage = async (e) => {
  const { id, req } = e.data;
  let res;
  try {
    const mod = await modP;
    if (req.kind === "export") {
      const board = new TextDecoder().decode(req.board);
      res = mod.occExport(board, req.jobJson);
    } else if (req.kind === "loadModel") {
      res = mod.occLoadModel(req.bytes, req.ext);
    } else {
      res = { ok: false, report: "occ_service: unknown request kind " + req.kind };
    }
  } catch (err) {
    res = { ok: false, report: "occ_service worker: " + err };
  }
  const out = {
    ok: !!(res && res.ok),
    report: res && res.report,
    fileName: res && res.fileName,
    bytes: res && res.bytes,
  };
  postMessage({ id, res: out }, out.bytes ? [out.bytes.buffer] : []);
};
