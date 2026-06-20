/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** WASM asset root, no trailing slash. Dev: "/wasm". Prod CDN: e.g. "https://cdn.pcbjam.com/wasm". */
  readonly VITE_WASM_ROOT?: string;
  /** Per-release WASM manifest file under VITE_WASM_ROOT (e.g. "manifest-2.7.7.json"); enables versioned per-tool folders. */
  readonly VITE_WASM_MANIFEST?: string;
  /** Release tag for this build (e.g. "2.7.7"); shown in the version badge. */
  readonly VITE_APP_TAG?: string;
  /** Source commit this build was made from; the badge links to it as the GPLv3 corresponding-source pointer. */
  readonly VITE_GIT_SHA?: string;
  /** Public source repo URL for the GPL editor (default github.com/emergence-engineering/pcbjam). */
  readonly VITE_REPO_URL?: string;
  /** @deprecated legacy alias for VITE_WASM_ROOT. */
  readonly VITE_WASM_ASSET_BASE_URL?: string;
  /** Project source: "remote" (default, REST backend) | "static" (read-only CDN gallery, no backend). */
  readonly VITE_PROJECT_SOURCE?: string;
  /** Static gallery manifest URL (required when VITE_PROJECT_SOURCE=static), e.g. https://cdn.pcbjam.com/content/2.7.7/manifest.json. */
  readonly VITE_PROJECT_MANIFEST_URL?: string;
  /** "idb" ⇒ loaded folders import into a browser-local (IndexedDB) project with its own URL; otherwise the in-page File System Access flow. */
  readonly VITE_LOCAL_PROJECTS?: string;
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
