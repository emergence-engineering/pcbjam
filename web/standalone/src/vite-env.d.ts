/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WASM_ASSET_BASE_URL?: string;
  /** Yjs collab provider: none | broadcastchannel | partykit | hocuspocus. */
  readonly VITE_YJS_PROVIDER?: string;
  /** Host/URL for network collab providers (partykit, hocuspocus). */
  readonly VITE_YJS_ENDPOINT?: string;
  /** Optional connection token for the collab provider. */
  readonly VITE_YJS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
