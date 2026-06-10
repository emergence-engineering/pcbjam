import type * as Y from "yjs";
import { connectBroadcastChannel } from "./broadcast-transport";

/**
 * A Y.Doc transport, normalized across backends. The reconciler/seed logic only
 * needs to know when the initial state has arrived (`whenSynced`) and how to
 * tear down (`destroy`); everything else is provider-specific.
 *
 * Providers are network libraries (MIT/ISC) linked by the GPL editor — fine, and
 * the closed PartyKit server is reached only over WSS (no linking).
 */
export interface YjsProvider {
  /**
   * Resolves once the doc holds the authoritative initial state: for network
   * providers when the server has synced; for BroadcastChannel after a short
   * settle window (a peer tab may have answered). The seed-vs-adopt decision
   * runs after this.
   */
  whenSynced(): Promise<void>;
  destroy(): void;
}

export type ProviderKind =
  | "none"
  | "broadcastchannel"
  | "partykit"
  | "hocuspocus";

export interface ProviderConfig {
  kind: ProviderKind;
  /** Host/URL for network providers (partykit, hocuspocus). */
  endpoint?: string;
  /** Connection params (e.g. `{ token }`); see @pcbjam/shared `collabConnectParams`. */
  params?: { token?: string };
  /** BroadcastChannel only: how long to wait for a peer tab before seeding. */
  settleMs?: number;
}

// The closed sync server (apps/sync) binds the room DO as `BoardRoom`;
// partyserver routes it under the kebab-cased party name.
const PARTYKIT_PARTY = "board-room";

function requireEndpoint(config: ProviderConfig): string {
  if (!config.endpoint) {
    throw new Error(
      `collab provider "${config.kind}" requires an endpoint (VITE_YJS_ENDPOINT)`,
    );
  }
  return config.endpoint;
}

function noopProvider(): YjsProvider {
  return { whenSynced: () => Promise.resolve(), destroy: () => {} };
}

function broadcastChannelProvider(
  doc: Y.Doc,
  room: string,
  settleMs: number,
): YjsProvider {
  const transport = connectBroadcastChannel(doc, room);
  return {
    // No server to sync with — keep the original seed-once heuristic: give a
    // peer tab a moment to answer the state query before deciding seed/adopt.
    whenSynced: () => new Promise((resolve) => setTimeout(resolve, settleMs)),
    destroy: () => transport.destroy(),
  };
}

async function partyKitProvider(
  doc: Y.Doc,
  endpoint: string,
  room: string,
  params: ProviderConfig["params"],
): Promise<YjsProvider> {
  const { default: YProvider } = await import("y-partyserver/provider");
  const provider = new YProvider(endpoint, room, doc, {
    party: PARTYKIT_PARTY,
    connect: true,
    params,
  });
  return {
    whenSynced: () =>
      new Promise<void>((resolve) => {
        if (provider.synced) return resolve();
        const onSync = (state: boolean) => {
          if (state) {
            provider.off("sync", onSync);
            resolve();
          }
        };
        provider.on("sync", onSync);
      }),
    destroy: () => provider.destroy(),
  };
}

async function hocuspocusProvider(
  doc: Y.Doc,
  endpoint: string,
  room: string,
  params: ProviderConfig["params"],
): Promise<YjsProvider> {
  const { HocuspocusProvider } = await import("@hocuspocus/provider");
  const provider = new HocuspocusProvider({
    url: endpoint,
    name: room,
    document: doc,
    ...(params?.token ? { token: params.token } : {}),
  });
  return {
    whenSynced: () =>
      new Promise<void>((resolve) => {
        if (provider.synced) return resolve();
        const onSync = () => {
          provider.off("synced", onSync);
          resolve();
        };
        provider.on("synced", onSync);
      }),
    destroy: () => provider.destroy(),
  };
}

/**
 * Connect a Y.Doc to the env-selected provider. Network libraries are imported
 * lazily so a deployment only ships the one it uses.
 */
export async function connectProvider(
  doc: Y.Doc,
  config: ProviderConfig,
  opts: { room: string },
): Promise<YjsProvider> {
  switch (config.kind) {
    case "broadcastchannel":
      return broadcastChannelProvider(doc, opts.room, config.settleMs ?? 300);
    case "partykit":
      return partyKitProvider(doc, requireEndpoint(config), opts.room, config.params);
    case "hocuspocus":
      return hocuspocusProvider(doc, requireEndpoint(config), opts.room, config.params);
    case "none":
      return noopProvider();
    default: {
      const _exhaustive: never = config.kind;
      return _exhaustive ?? noopProvider();
    }
  }
}
