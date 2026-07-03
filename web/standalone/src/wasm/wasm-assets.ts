import type { Tool } from "@pcbjam/shared";
import { WASM_MANIFEST_FILE, WASM_ROOT } from "@/lib/config";
import { TOOL_BUNDLE, type Bundle } from "./constants";

/**
 * Resolve the per-tool WASM asset base at runtime from the CDN release manifest.
 *
 * The CDN stores each tool in a content-addressed, immutable, self-contained
 * folder `WASM_ROOT/<tool>/<ver>/` (`<tool>.wasm`, `<tool>.js`, `wx.js`,
 * `wx-dom.js`, `images.tar.gz`). A per-release `manifest-<appTag>.json` maps
 * `tool -> ver`; we fetch it ONCE per page load (uncached, so a manifest edit —
 * e.g. rolling a bad tool back to an older folder — takes effect on the next
 * load with no app rebuild). See docs/features/demo-deploy/0001-*.
 *
 * No manifest configured (dev / same-origin) ⇒ the flat `WASM_ROOT` layout.
 */
export interface WasmManifest {
  schema: number;
  tag: string;
  tools: Record<string, string>;
}

let manifestPromise: Promise<WasmManifest> | null = null;

function loadManifest(): Promise<WasmManifest> {
  return (manifestPromise ??= (async () => {
    const url = `${WASM_ROOT}/${WASM_MANIFEST_FILE}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`WASM manifest ${res.status}: ${url}`);
    return (await res.json()) as WasmManifest;
  })());
}

/**
 * Asset base (no trailing slash) for `bootKicadTool({ base })`.
 *   - `override` (e.g. an e2e fixture) wins, used verbatim.
 *   - no manifest ⇒ flat `WASM_ROOT`.
 *   - manifest ⇒ `WASM_ROOT/<tool>/<ver>` from `manifest-<appTag>.json`.
 */
export async function resolveWasmBase(
  tool: Tool | Bundle,
  override?: string,
): Promise<string> {
  if (override) return override.replace(/\/+$/, "");
  if (!WASM_MANIFEST_FILE) return WASM_ROOT; // flat (dev / same-origin)
  // A tool may be served by a shared bundle (all four editors → kicad_editor);
  // resolve the folder/version of the bundle, not the logical tool (bundles are
  // the only thing published/listed in the manifest). A caller may also name a
  // bundle directly (occ_service — a delivery artifact backing no tool).
  const bundle: Bundle =
    (TOOL_BUNDLE as Partial<Record<string, Bundle>>)[tool] ?? (tool as Bundle);
  const manifest = await loadManifest();
  const ver = manifest.tools?.[bundle];
  if (!ver) {
    throw new Error(`no WASM version for "${bundle}" in ${WASM_MANIFEST_FILE}`);
  }
  return `${WASM_ROOT}/${bundle}/${ver}`;
}
