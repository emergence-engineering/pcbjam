export {};

declare global {
  interface EmscriptenFS {
    mkdirTree(path: string): void;
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string, opts?: { encoding?: "binary" | "utf8" }): unknown;
    analyzePath(path: string): { exists: boolean };
  }

  // Loose shape of the wxWidgets-WASM element registry exposed by wx.js.
  interface WxElementInfo {
    id: string;
    typeName: string;
    name: string;
    label: string;
    visible: boolean;
    enabled: boolean;
    screenX: number;
    screenY: number;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  }

  interface WxElementRegistry {
    findAll(filter?: {
      visible?: boolean;
      enabled?: boolean;
      type?: string;
      label?: string;
      name?: string;
    }): WxElementInfo[];
    findByLabel(label: string, options?: Record<string, unknown>): WxElementInfo[];
    findRenderedByLabel?(
      label: string,
      options?: Record<string, unknown>,
    ): WxElementInfo[];
  }

  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Module?: any;
    FS?: EmscriptenFS;
    wxElementRegistry?: WxElementRegistry;
  }

  // The browsing-context window the tool runs in — now the top-level `window`
  // (the WASM boots in-document, not in an iframe). The Window interface PLUS the
  // global declarations (console, PointerEvent, document, …) that live on
  // `typeof globalThis`, not on the bare Window interface.
  type ToolWindow = Window & typeof globalThis;
}
