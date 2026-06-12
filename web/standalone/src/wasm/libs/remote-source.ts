import { contract } from "@pcbjam/shared";
import { initClient } from "@ts-rest/core";
import type { LibInfo, LibItemInfo, LibsSource } from "./source";

/**
 * A `LibsSource` backed by a contract-conforming backend (the closed registry
 * server, or the GPL example backend). List ops go through the ts-rest client;
 * item bodies stream from the raw text route `GET /api/libs/:lib/items/:kind/:name`
 * (binary/text does not round-trip ts-rest — same as file-byte download).
 */
export function remoteLibsSource(apiBase: string): LibsSource {
  const client = initClient(contract, { baseUrl: apiBase, baseHeaders: {} });

  return {
    async listLibs(): Promise<LibInfo[]> {
      const res = await client.listLibs();
      if (res.status !== 200) return [];
      return res.body.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description ?? null,
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
      const url =
        `${apiBase}/api/libs/${encodeURIComponent(libId)}/items/` +
        `${encodeURIComponent(kind)}/${encodeURIComponent(name)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.text();
    },
  };
}
