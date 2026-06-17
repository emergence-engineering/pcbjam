import { MEMFS_PROJECTS_DIR, memfsProjectDir } from "./constants";

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
    /**
     * Fired with every saved project-relative path BEFORE persistence (so it runs even
     * when `saveBytes` is absent, e.g. Y.Doc-backed sessions). The hierarchical-sheet
     * collab manager uses it to discover + warm a sheet file created mid-session
     * ("Add Sheet"), which the page-load file list can't contain.
     */
    onSaved?: (relPath: string) => void;
  },
): void {
  const projectPrefix = `${memfsProjectDir(opts.slug)}/`;
  // The editor's default "projects" home (KiCad's GetDefaultUserProjectsPath) — one
  // level above this project's own folder. A blank editor's Save-As lands HERE, not in
  // the project subfolder, so we also accept a bare file saved directly in it: the page
  // holds exactly one project in MEMFS, so such a file belongs to it. (Files under the
  // project's own folder still take the first branch, with their full relative path.)
  const projectsHome = `${MEMFS_PROJECTS_DIR}/`;

  /** Saved MEMFS path → project-relative path, or null if it's outside the project. */
  const toRelPath = (absPath: string): string | null => {
    if (absPath.startsWith(projectPrefix)) return absPath.slice(projectPrefix.length);
    if (absPath.startsWith(projectsHome)) {
      const rest = absPath.slice(projectsHome.length);
      if (rest && !rest.includes("/")) return rest; // a bare file in the projects home
    }
    return null;
  };

  const onSave = (absPath: string) => {
    const relPath = toRelPath(absPath);
    if (relPath === null) {
      opts.log(`[save] ignoring save outside project dir: ${absPath}`);
      return;
    }

    opts.onSaved?.(relPath);

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
