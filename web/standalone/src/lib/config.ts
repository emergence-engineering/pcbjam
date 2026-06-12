export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3050";

// Default is SAME-ORIGIN ("/wasm", served from public/wasm by Vite). KiCad WASM
// pthread workers cannot be created cross-origin, so dev must serve same-origin.
// Override with an absolute URL (e.g. a CDN) only if that origin is configured
// to also satisfy the worker/COEP constraints.
export const WASM_ASSET_BASE_URL =
  import.meta.env.VITE_WASM_ASSET_BASE_URL ?? "/wasm";

import type { ProviderConfig, ProviderKind } from "@/wasm/collab";

/**
 * Which Yjs collab provider this deployment uses (one active per env), and its
 * endpoint/token. Defaults to `broadcastchannel` so a vanilla checkout keeps
 * the cross-tab-only behavior with no backend. Built here at the composition
 * root and passed into `startKicadCollab`, so `wasm/collab` stays env-agnostic.
 */
export function yjsProviderConfig(): ProviderConfig {
  const kind = (import.meta.env.VITE_YJS_PROVIDER ?? "broadcastchannel") as ProviderKind;
  const token = import.meta.env.VITE_YJS_TOKEN;
  return {
    kind,
    endpoint: import.meta.env.VITE_YJS_ENDPOINT,
    params: token ? { token } : undefined,
  };
}

/**
 * Where a backend project's DOCUMENT content lives (per deployment, not per
 * route — /p/<project> URLs behave the same either way):
 *
 *   "api"  — file bytes are fetched from the REST backend and a user save is
 *            uploaded back to it (the Y.Doc, when collab is on, mirrors the file).
 *   "ydoc" — the collab room is the source of truth: when it holds the document
 *            it is materialized client-side (docToFile) instead of fetching the
 *            file, and saves stay in MEMFS (the provider persists the doc). The
 *            REST backend still serves project metadata + sibling files, and the
 *            file fetch remains the first-open fallback that seeds the room.
 */
export type DocSource = "api" | "ydoc";

export function docSourceConfig(): DocSource {
  return import.meta.env.VITE_DOC_SOURCE === "ydoc" ? "ydoc" : "api";
}
