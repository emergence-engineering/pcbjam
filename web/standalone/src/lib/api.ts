import type { DriftReportBody, Lib, Project } from "@pcbjam/shared";
import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, PROJECT_SOURCE_KIND } from "./config";
import { client } from "./contract-client";
import { downloadBytes } from "./download";
import {
  ReadOnlyProjectError,
  descriptorForSlug,
  listPrimaryProjects,
  localProjectStore,
  projectSource,
} from "./project-source";
import type { SourceDescriptor } from "./project-source-shared";

/**
 * Project/file reads go through the active PROJECT SOURCE (lib/project-source.ts):
 * the @pcbjam/shared REST backend, the read-only static gallery (demo mode), or
 * the browser-local IndexedDB store — composited per slug. Libraries + collab
 * drift reporting are backend-only and stay on the contract client here.
 */

/** Remote/gallery projects (excludes browser-local ones — those have their own
 *  hook so the home page can list + manage them as a distinct section). */
export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => listPrimaryProjects(),
  });
}

/** Browser-local (IndexedDB) projects; empty when the local store is disabled. */
export function useLocalProjects() {
  return useQuery({
    queryKey: ["local-projects"],
    queryFn: (): Promise<Project[]> =>
      localProjectStore()?.listProjects() ?? Promise.resolve([]),
  });
}

/** The source kind that owns `slug` (local / remote-ro / remote-rw) — for the
 *  "where your edits go" chip on the project + editor views. */
export function useSourceDescriptor(slug: string) {
  return useQuery({
    queryKey: ["source-descriptor", slug],
    queryFn: (): Promise<SourceDescriptor> => descriptorForSlug(slug),
    enabled: !!slug,
  });
}

/**
 * Libraries the backend serves, optionally filtered to a kind. In static (no
 * backend) mode there are none, so we short-circuit to an empty list rather than
 * fire a doomed request.
 */
export function useLibs(kind?: "symbol" | "footprint") {
  return useQuery({
    queryKey: ["libs", kind ?? "all"],
    queryFn: async (): Promise<Lib[]> => {
      if (PROJECT_SOURCE_KIND === "static") return [];
      const res = await client.listLibs({ query: { kind } });
      if (res.status !== 200) throw new Error("failed to list libraries");
      return res.body;
    },
  });
}

export function useProject(slug: string) {
  return useQuery({
    queryKey: ["project", slug],
    queryFn: () => projectSource().getProject(slug),
  });
}

/** File bytes from the active source (backend stream, or the static CDN gallery). */
export function fetchFileBytes(
  slug: string,
  relPath: string,
): Promise<Uint8Array> {
  return projectSource().fetchFileBytes(slug, relPath);
}

/**
 * Persist a saved file. A writable source (the backend) uploads it; a read-only
 * source (the static demo gallery) has no upload target, so the save downloads
 * to the user's machine instead. The remote-vs-static choice is config-driven
 * (the active project source), so callers just call this.
 */
export async function uploadFileBytes(
  slug: string,
  relPath: string,
  bytes: Uint8Array,
): Promise<void> {
  const source = projectSource();
  if (!source.uploadFileBytes) {
    downloadBytes(relPath, bytes);
    return;
  }
  try {
    await source.uploadFileBytes(slug, relPath, bytes);
  } catch (e) {
    // Composite write to a read-only (gallery) project → fall back to download.
    if (e instanceof ReadOnlyProjectError) {
      downloadBytes(relPath, bytes);
      return;
    }
    throw e;
  }
}

// --- collaboration drift reporting (ysync; backend-only) ---

/**
 * Report a detected ydoc/wasm drift (the editor's periodic, every-N-edits check).
 * Best-effort: a failed report must never disrupt editing, so callers ignore
 * rejections.
 */
export async function reportDrift(
  slug: string,
  body: DriftReportBody,
): Promise<void> {
  await client.reportDrift({ params: { project: slug }, body });
}

/**
 * Fire-and-forget drift report that survives the page closing — used by the
 * session-end (`beforeunload`) check. `sendBeacon` queues the POST past unload;
 * a keepalive `fetch` is the fallback when the beacon is rejected (too large).
 */
export function reportDriftBeacon(slug: string, body: DriftReportBody): void {
  const url = `${API_BASE_URL}/api/projects/${encodeURIComponent(slug)}/drift`;
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  try {
    if (navigator.sendBeacon(url, blob)) return;
  } catch {
    /* fall through to keepalive fetch */
  }
  void fetch(url, { method: "POST", body: blob, keepalive: true }).catch(() => {});
}
