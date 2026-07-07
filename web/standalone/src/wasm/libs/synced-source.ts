import { PROJECT_HEADER, SCOPE_HEADER, USER_HEADER } from "@pcbjam/shared";
import { SyncStack, type LayerDescriptor } from "@pcbjam/sync-client";
import type { LibInfo, LibItemInfo, LibsSource } from "./source";

/**
 * A one-lib `LibsSource` backed by the r2-idb-sync bridge
 * (docs/features/r2-idb-sync). On first use it resolves the lib's **layer stack**
 * from the backend (`POST /api/libs/:lib/sync-stack`), opens a `SyncStack`
 * (hydrating a per-lib IndexedDB cache once, then serving locally + realtime), and
 * serves the editor's list/get/save from it — replacing the per-item network
 * round-trips of `remoteLibsSource`.
 *
 * The adapter consumes an OPAQUE stack: it never knows which layer is the shared
 * read-only origin and which is the writable overlay (that's the backend's call).
 * Its only domain knowledge is the `"<kind>/<name>"` path scheme.
 */
export function syncedLibsSource(
  libId: string,
  opts: {
    apiBase: string;
    scope: string;
    user?: string;
    project?: string;
    log?: (msg: string) => void;
  },
): LibsSource {
  const log = opts.log ?? (() => {});
  let opened: Promise<{ stack: SyncStack; info: LibInfo }> | null = null;

  async function ensure(): Promise<{ stack: SyncStack; info: LibInfo }> {
    if (!opened) opened = resolveAndOpen(libId, opts, log);
    return opened;
  }

  const pathOf = (kind: string, name: string) => `${kind}/${name}`;

  return {
    async listLibs(): Promise<LibInfo[]> {
      const { info } = await ensure();
      return [info];
    },
    async listItems(): Promise<LibItemInfo[]> {
      const { stack } = await ensure();
      return (await stack.list()).map((e) => splitPath(e.path));
    },
    async presync(opts): Promise<void> {
      // One lib: resolving + opening its stack warms the IDB cache.
      opts?.onProgress?.({ done: 0, total: 1, current: "library" });
      try {
        const { info } = await ensure();
        opts?.onProgress?.({ done: 1, total: 1, current: info.name });
      } catch {
        opts?.onProgress?.({ done: 1, total: 1, current: "library" });
      }
    },
    async getAllItems(): Promise<
      Array<{ kind: string; name: string; body: Uint8Array }>
    > {
      // Bulk merged read across the opaque layer stack (origin + mirror overlay),
      // top-wins — the mirror invariant readAll() preserves. One crossing, no
      // per-item gets. "Copy as-is": raw bytes (no TextDecoder) — see cdn-source.
      const { stack } = await ensure();
      return [...(await stack.readAll())].map(([path, bytes]) => {
        const { kind, name } = splitPath(path);
        return { kind, name, body: bytes };
      });
    },
    async getItemBody(_id, kind, name): Promise<string | null> {
      const { stack } = await ensure();
      const bytes = await stack.read(pathOf(kind, name));
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    async saveItemBody(_id, kind, name, body): Promise<boolean> {
      const { stack } = await ensure();
      try {
        await stack.push(pathOf(kind, name), new TextEncoder().encode(body));
        return true;
      } catch (e) {
        log(`[synced] save failed for ${kind}/${name}: ${String(e)}`);
        return false;
      }
    },
  };
}

async function resolveAndOpen(
  libId: string,
  opts: { apiBase: string; scope: string; user?: string; project?: string },
  log: (msg: string) => void,
): Promise<{ stack: SyncStack; info: LibInfo }> {
  const headers: Record<string, string> = {
    [SCOPE_HEADER]: opts.scope,
    ...(opts.user ? { [USER_HEADER]: opts.user } : {}),
    ...(opts.project ? { [PROJECT_HEADER]: opts.project } : {}),
  };
  const res = await fetch(
    `${opts.apiBase}/api/scopes/${encodeURIComponent(opts.scope)}/libs/${encodeURIComponent(libId)}/sync-stack`,
    // credentials: session-cookie auth, here and on every layer fetch below —
    // live layers are membership-gated by the API worker per request.
    { method: "POST", headers, credentials: "include" },
  );
  if (!res.ok) throw new Error(`sync-stack resolve failed: HTTP ${res.status}`);
  const body = (await res.json()) as {
    lib: { id: string; name: string };
    layers: LayerDescriptor[];
  };
  log(`[synced] resolved ${body.layers.length} layer(s) for lib ${libId}`);

  // The descriptors carry no bearer token — live-layer HTTP ops authenticate
  // with the session cookie, so the stack's fetch must send credentials. The
  // realtime WebSocket gets cookies automatically (same-site handshake).
  const credentialedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, credentials: "include" });
  const stack = new SyncStack({ layers: body.layers, fetchImpl: credentialedFetch });
  await stack.open();
  return {
    stack,
    info: { id: body.lib.id, name: body.lib.name, description: null },
  };
}

/** Decode a `"<kind>/<name>"` namespace path back into editor item terms. */
function splitPath(path: string): LibItemInfo {
  const i = path.indexOf("/");
  return i < 0
    ? { kind: path, name: "" }
    : { kind: path.slice(0, i), name: path.slice(i + 1) };
}
