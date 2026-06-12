import { memfsProjectDir } from "./constants";

/**
 * Persist one saved file's bytes outside MEMFS. The counterpart of
 * `fetchBytes` on the load side: each page decides the destination —
 * API upload (backend projects), local-disk write-back / download (local
 * folders). Absent ⇒ saves stay MEMFS-only (e.g. Y.Doc-backed sessions,
 * where the provider already persists the document).
 */
export type SaveBytes = (relPath: string, bytes: Uint8Array) => Promise<void>;

export interface SaveHookWindow {
  FS?: EmscriptenFS;
  kicadCollab?: { onSave?: (absPath: string) => void };
}

/**
 * Register the C++ → JS save notification sink (`window.kicadCollab.onSave`).
 * The kicad fork fires it from each tool's save chokepoint (SaveDrawingSheetFile /
 * saveSchematicFile / SavePcbFile) AFTER the bytes hit MEMFS, so the handler just
 * reads them back and routes them to `saveBytes`. eeschema may fire once per
 * sheet file in a multi-sheet save — each call is one complete file.
 */
export function registerSaveHook(
  win: SaveHookWindow,
  opts: {
    slug: string;
    saveBytes?: SaveBytes;
    log: (msg: string) => void;
    onStatus: (text: string) => void;
  },
): void {
  const projectPrefix = `${memfsProjectDir(opts.slug)}/`;

  const onSave = (absPath: string) => {
    if (!absPath.startsWith(projectPrefix)) {
      opts.log(`[save] ignoring save outside project dir: ${absPath}`);
      return;
    }
    const relPath = absPath.slice(projectPrefix.length);

    if (!opts.saveBytes) {
      opts.log(`[save] ${relPath} saved in MEMFS (no external save target)`);
      return;
    }

    let bytes: Uint8Array;
    try {
      const data = win.FS?.readFile(absPath);
      if (!(data instanceof Uint8Array)) throw new Error("FS.readFile returned no bytes");
      bytes = data;
    } catch (err) {
      opts.log(`[save] FAILED to read ${absPath} back from MEMFS: ${String(err)}`);
      opts.onStatus(`Save failed: ${relPath}`);
      return;
    }

    opts.onStatus(`Saving ${relPath}…`);
    void opts
      .saveBytes(relPath, bytes)
      .then(() => {
        opts.log(`[save] ${relPath} persisted (${bytes.length} bytes)`);
        opts.onStatus(`Saved ${relPath} ✓`);
        setTimeout(() => opts.onStatus(""), 2500);
      })
      .catch((err) => {
        opts.log(`[save] FAILED to persist ${relPath}: ${String(err)}`);
        opts.onStatus(`Save failed: ${relPath} — see console`);
      });
  };

  // Spread-merge like moduleItemsBridge does, so sibling hooks (onItems/onDelta)
  // registered before or after survive.
  win.kicadCollab = { ...win.kicadCollab, onSave };
}
