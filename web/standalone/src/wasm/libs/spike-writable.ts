import type { LibInfo, LibItemInfo, LibsSource } from "./source";

/**
 * 0004-A write-path spike (no backend). Wraps a `LibsSource` with ONE in-memory
 * writable user lib so the editor's save-symbol flow has a target and we can
 * exercise the full save → enumerate → load round-trip through the same WASM
 * bridge — without committing to the backend design first. Gated by
 * `?libwrite=1`. Saved bodies are mirrored onto `window.__pcbjamSaved` so the
 * Playwright probe can inspect them. Replaced in 0004-C by real remote writes.
 */
const SPIKE_RW_LIB_ID = "spike-user";
const SPIKE_RW_LIB_NAME = "My Symbols (spike)";

declare global {
  interface Window {
    __pcbjamSaved?: Record<string, string>;
  }
}

export function withSpikeWritableLib(
  inner: LibsSource | null,
  log: (msg: string) => void,
): LibsSource {
  const store = new Map<string, string>(); // symbol name -> body
  window.__pcbjamSaved = Object.create(null) as Record<string, string>;

  const isSpike = (libId: string) => libId === SPIKE_RW_LIB_ID;

  return {
    async listLibs(): Promise<LibInfo[]> {
      // Resilient to a missing backend: the spike must boot standalone (the
      // writable lib is in-memory), so an unreachable inner source just yields
      // no origins rather than failing the whole table.
      let base: LibInfo[] = [];
      try {
        base = inner ? await inner.listLibs() : [];
      } catch (e) {
        log(`[libs] spike: inner listLibs failed, origins omitted: ${String(e)}`);
      }
      return [
        ...base,
        { id: SPIKE_RW_LIB_ID, name: SPIKE_RW_LIB_NAME, type: "user" },
      ];
    },

    async listItems(libId: string): Promise<LibItemInfo[]> {
      if (isSpike(libId))
        return [...store.keys()].map((name) => ({ kind: "symbol", name }));
      return inner ? inner.listItems(libId) : [];
    },

    async getItemBody(
      libId: string,
      kind: string,
      name: string,
    ): Promise<string | null> {
      if (isSpike(libId)) return store.get(name) ?? null;
      return inner ? inner.getItemBody(libId, kind, name) : null;
    },

    async saveItemBody(
      libId: string,
      kind: string,
      name: string,
      body: string,
    ): Promise<boolean> {
      if (!isSpike(libId)) {
        return inner?.saveItemBody
          ? inner.saveItemBody(libId, kind, name, body)
          : false;
      }
      store.set(name, body);
      window.__pcbjamSaved![name] = body;
      log(`[libs] spike saved symbol "${name}" (${body.length} bytes)`);
      return true;
    },
  };
}
