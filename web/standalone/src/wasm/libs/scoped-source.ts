import type { LibInfo, LibItemInfo, LibsSource } from "./source";

/**
 * Wrap a `LibsSource` so the editor sees exactly ONE library — the lib-table
 * gets a single row, instead of "browse all backend libs". Used to open a
 * specific backend library scoped to itself (HomePage → a lib chip).
 *
 * Read-only scope: `listItems`/`getItemBody` forward to the base for the target
 * lib; no `createLib`/`saveItemBody` is exposed (the editor opens this origin to
 * browse, not to write — matching today's read-only-origin behavior).
 */
export function scopedLibsSource(base: LibsSource, libId: string): LibsSource {
  return {
    async listLibs(kind?: string): Promise<LibInfo[]> {
      const all = await base.listLibs(kind);
      return all.filter((l) => l.id === libId);
    },
    listItems(id: string): Promise<LibItemInfo[]> {
      return base.listItems(id);
    },
    getItemBody(id: string, kind: string, name: string): Promise<string | null> {
      return base.getItemBody(id, kind, name);
    },
  };
}
