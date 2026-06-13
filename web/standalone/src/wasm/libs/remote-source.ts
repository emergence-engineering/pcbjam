import { contract, OWNER_HEADER } from "@pcbjam/shared";
import { initClient } from "@ts-rest/core";
import type { LibInfo, LibItemInfo, LibsSource } from "./source";

/**
 * A `LibsSource` backed by a contract-conforming backend (the closed registry
 * server, or the GPL example backend). Read list ops go through the ts-rest
 * client; item bodies stream from the raw text route
 * `GET /api/libs/:lib/items/:kind/:name`, and writes hit the symmetric
 * `PUT` route (binary/text doesn't round-trip ts-rest). The `owner` is carried
 * on every request via `OWNER_HEADER` (thin per-user; absent ⇒ backend default).
 */
export function remoteLibsSource(apiBase: string, owner?: string): LibsSource {
  const ownerHeaders: Record<string, string> = owner
    ? { [OWNER_HEADER]: owner }
    : {};
  const client = initClient(contract, {
    baseUrl: apiBase,
    baseHeaders: ownerHeaders,
  });

  const itemUrl = (libId: string, kind: string, name: string) =>
    `${apiBase}/api/libs/${encodeURIComponent(libId)}/items/` +
    `${encodeURIComponent(kind)}/${encodeURIComponent(name)}`;

  return {
    async listLibs(): Promise<LibInfo[]> {
      const res = await client.listLibs();
      if (res.status !== 200) return [];
      return res.body.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description ?? null,
        type: l.type,
      }));
    },

    async listItems(libId: string): Promise<LibItemInfo[]> {
      const res = await client.listLibItems({ params: { lib: libId } });
      if (res.status !== 200) return [];
      return res.body.map((i) => ({ kind: i.kind, name: i.name }));
    },

    async getItemBody(
      libId: string,
      kind: string,
      name: string,
    ): Promise<string | null> {
      const res = await fetch(itemUrl(libId, kind, name), {
        headers: ownerHeaders,
      });
      if (!res.ok) return null;
      return await res.text();
    },

    async saveItemBody(
      libId: string,
      kind: string,
      name: string,
      body: string,
    ): Promise<boolean> {
      const res = await fetch(itemUrl(libId, kind, name), {
        method: "PUT",
        headers: { ...ownerHeaders, "Content-Type": "text/plain; charset=utf-8" },
        body,
      });
      return res.ok;
    },

    async createLib(name: string): Promise<LibInfo | null> {
      const res = await client.createLib({ body: { name } });
      if (res.status !== 201) return null;
      return {
        id: res.body.id,
        name: res.body.name,
        description: res.body.description ?? null,
        type: res.body.type,
      };
    },
  };
}
