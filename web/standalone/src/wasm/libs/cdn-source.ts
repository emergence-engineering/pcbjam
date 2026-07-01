import { SyncStack, type SyncStackOptions } from "@pcbjam/sync-client";
import type { LibInfo, LibItemInfo, LibsSource } from "./source";

/**
 * A read-only, no-backend `LibsSource` that serves the FULL default KiCad symbol
 * + footprint set from immutable CDN snapshots (the demo's libs). Each lib is a
 * version-pinned r2-idb-sync **static origin** (docs/features/r2-idb-sync): the
 * editor opens it as a one-layer `SyncStack` that fetches one `bundle` cold and
 * serves list/get from a per-lib IndexedDB cache after that (0 fetches warm,
 * works offline). No resolve endpoint — the layer descriptor is built locally
 * from the lib id + tag, so there's no backend in the loop.
 *
 * Layout under the manifest's directory (`<cdn>/libs/kicad/<tag>/`):
 *   manifest.json            top index: every lib (id, name, kind, itemCount)
 *   <libId>/manifest         per-lib SyncManifest (GET .../manifest)
 *   <libId>/bundle           per-lib bundle: manifest + all bodies (cold init)
 * Item paths inside a lib follow the `"<kind>/<name>"` scheme.
 */

interface CdnLibEntry {
  id: string;
  name: string;
  kind: "symbol" | "footprint";
  itemCount?: number;
  description?: string | null;
}
interface CdnLibsManifest {
  schema: number;
  tag: string;
  libs: CdnLibEntry[];
}

export function cdnLibsSource(
  manifestUrl: string,
  // Test seam: inject fetch + an in-memory store (SyncStack defaults to real
  // fetch + IndexedDB). Production passes nothing.
  opts?: Pick<SyncStackOptions, "fetchImpl" | "storeFactory">,
): LibsSource {
  const baseDir = manifestUrl.replace(/\/[^/]*$/, ""); // <cdn>/libs/kicad/<tag>
  const fetchImpl = opts?.fetchImpl ?? fetch;

  let manifestP: Promise<CdnLibsManifest> | null = null;
  const fetchManifest = async (): Promise<CdnLibsManifest> => {
    // Retry with backoff. Firefox can fail a cross-origin fetch issued in the
    // first moments after navigation under COEP (the lazy path runs seconds
    // later and succeeds); a short retry rides past that window. The pre-sync
    // warm-up, which fires this earliest, is what surfaced it.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 200 * attempt));
      try {
        const r = await fetchImpl(manifestUrl, { cache: "no-store" });
        if (!r.ok)
          throw new Error(`cdn libs manifest ${r.status}: ${manifestUrl}`);
        return (await r.json()) as CdnLibsManifest;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  };
  const loadManifest = (): Promise<CdnLibsManifest> => {
    if (!manifestP) {
      // NEVER cache a rejection: a transient failure must not poison every later
      // listLibs/getItemBody — the next call retries from scratch.
      manifestP = fetchManifest().catch((e) => {
        manifestP = null;
        throw e;
      });
    }
    return manifestP;
  };

  // One lazily-opened SyncStack per lib (its IDB store is keyed by namespace, so
  // a lib is cached once and reused across opens).
  const stacks = new Map<string, Promise<SyncStack>>();
  const openStack = (libId: string): Promise<SyncStack> => {
    let p = stacks.get(libId);
    if (!p) {
      p = (async () => {
        const m = await loadManifest();
        const stack = new SyncStack({
          layers: [
            {
              namespace: `kicad:${m.tag}:${libId}`,
              kind: "static",
              url: `${baseDir}/${encodeURIComponent(libId)}`,
            },
          ],
          ...opts,
        });
        await stack.open();
        return stack;
      })().catch((e) => {
        // Don't cache a failed open (e.g. an early-boot fetch blip) — the lazy
        // path must be able to retry this lib instead of inheriting the failure.
        stacks.delete(libId);
        throw e;
      });
      stacks.set(libId, p);
    }
    return p;
  };

  return {
    async listLibs(kind?: string): Promise<LibInfo[]> {
      const m = await loadManifest();
      return m.libs
        .filter((l) => !kind || l.kind === kind)
        .map((l) => ({
          id: l.id,
          name: l.name,
          description: l.description ?? null,
          type: "origin",
          itemCount: l.itemCount,
        }));
    },
    async listItems(libId: string): Promise<LibItemInfo[]> {
      const stack = await openStack(libId);
      return (await stack.list()).map((e) => splitPath(e.path));
    },
    async presync(opts): Promise<void> {
      const { kind, concurrency = 6, onProgress, signal } = opts ?? {};
      let m: CdnLibsManifest;
      try {
        m = await loadManifest();
      } catch {
        // Best-effort warm-up: a manifest hiccup here (e.g. the early-boot
        // Firefox/COEP fetch blip) is non-fatal — skip quietly and let the lazy
        // path fetch on demand (loadManifest no longer caches the failure).
        return;
      }
      const libs = m.libs.filter((l) => !kind || l.kind === kind);
      const total = libs.length;
      let done = 0;
      onProgress?.({ done, total, current: "" });
      // Concurrency-limited pool: each openStack cold-fetches one bundle into IDB
      // (warm ⇒ a cheap manifest diff). Tolerate per-lib failures so one bad lib
      // doesn't abort the warm-up.
      let idx = 0;
      const worker = async (): Promise<void> => {
        while (idx < libs.length) {
          if (signal?.aborted) return;
          const lib = libs[idx++]!;
          onProgress?.({ done, total, current: lib.name });
          try {
            await openStack(lib.id);
          } catch {
            // best-effort: the lib still loads lazily on demand
          }
          onProgress?.({ done: ++done, total, current: lib.name });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, total) }, () => worker()),
      );
    },
    async getAllItems(
      libId: string,
    ): Promise<Array<{ kind: string; name: string; body: Uint8Array }>> {
      // One bulk merged read of the whole lib (the IDB cache after cold bundle).
      // "Copy as-is": hand back the raw IDB bytes (no TextDecoder) so the provider
      // frames them and the bridge memcpy's them into wasm with no string/JSON
      // detour — the plugin slices them straight out of the wasm heap.
      const stack = await openStack(libId);
      return [...(await stack.readAll())].map(([path, bytes]) => {
        const { kind, name } = splitPath(path);
        return { kind, name, body: bytes };
      });
    },
    async getItemBody(
      libId: string,
      kind: string,
      name: string,
    ): Promise<string | null> {
      const stack = await openStack(libId);
      const bytes = await stack.read(`${kind}/${name}`);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    // Read-only: no saveItemBody / createLib (the demo's default libs are fixed).
  };
}

/** Decode a `"<kind>/<name>"` namespace path into editor item terms. */
function splitPath(path: string): LibItemInfo {
  const i = path.indexOf("/");
  return i < 0
    ? { kind: path, name: "" }
    : { kind: path.slice(0, i), name: path.slice(i + 1) };
}
