import type * as Y from "yjs";
import { collabRoomId, type KicadDoc } from "@pcbjam/shared";
import { connectKicadDoc, type KicadDocSession } from "./index";
import {
  bindKicadCollab,
  moduleItemsBridge,
  type KicadBinding,
  type KicadItemsModule,
  type KicadItemsWindow,
} from "./kicad-binding";
import type { ProviderConfig } from "./provider";
import { clog, cwarn } from "./debug";

/**
 * Warm-pool multi-room collab manager for hierarchical schematics (subschemas).
 *
 * A hierarchical design references several `.kicad_sch` files; each is its own collab
 * room. This manager keeps EVERY discovered sheet's Y.Doc + provider connected for the
 * whole session (the "warm pool"), so the doc stays current over its open WebSocket
 * even when that sheet isn't on screen and switching sheets needs no reconnect.
 *
 * The C++ items bridge (`window.kicadCollab.onItems` / `kicadCollabApplyItems` /
 * `kicadCollabSnapshotItems`) is a SINGLETON tied to the editor's active screen, so at
 * most ONE room may be bound to the editor at a time. Navigation (the C++
 * `onSheetChanged` hook → {@link SheetCollabManager.switchTo}) re-routes that single
 * binding between already-warm docs; it does not tear down providers. The Phase-0 C++
 * change scopes the snapshot/diff to the active screen, so each room carries exactly its
 * own sheet's items and per-sheet seed/adopt is correct.
 *
 * Background sheets stay synced at the DATA layer (their doc accumulates remote edits)
 * but are not reflected in the editor's other-sheet view until you navigate in — at
 * which point the doc is already warm, so the merge into view is instant. Fully live
 * non-active-sheet VIEW updates would need a sheet-targeted C++ apply (a future upgrade
 * this design leaves open). Presence (per-room awareness) is likewise additive.
 */
export interface SheetCollabManager {
  /** Pre-connect (warm) a set of sheet files so later switches are instant. */
  connectAll(sheetPaths: string[]): Promise<void>;
  /** Bind the editor to `sheetPath` (driven by the C++ `onSheetChanged` hook). */
  switchTo(sheetPath: string): Promise<void>;
  /** Warm a sheet created mid-session (driven by the save hook on an unknown path). */
  onboard(sheetPath: string): Promise<void>;
  /** The currently-bound sheet, for drift-detection wiring (null before first switch). */
  active(): { sheetPath: string; doc: Y.Doc } | null;
  /** Tear down ALL bindings + providers + docs (session end / unmount). */
  destroy(): void;
}

export interface SheetManagerOptions {
  /** The Emscripten Module exposing the v2 items bridge exports. */
  mod: KicadItemsModule;
  /** The global the C++ emit side calls into (`window.kicadCollab.onItems`). */
  win: KicadItemsWindow;
  /** Project uuid — keys each room as `collabRoomId(projectId, sheetPath)`. */
  projectId: string;
  /** The env-selected Yjs provider config (same one the single-room path uses). */
  provider: ProviderConfig;
  /**
   * Lossless seed for an EMPTY room: the child `.kicad_sch` parsed from MEMFS
   * (`fileToDoc`), so a first-ever-opened sheet seeds its room from the file.
   */
  seedDocForPath: (sheetPath: string) => KicadDoc | undefined;
  /**
   * Called whenever the active sheet changes (or clears on destroy) so the host can
   * (re)start drift detection on the now-active doc.
   */
  onActiveChange?: (active: { sheetPath: string; doc: Y.Doc } | null) => void;
  log: (m: string) => void;
  /**
   * `docSource: "ydoc"` only: the entry sheet's room is already connected (and possibly
   * materialized from the doc). Adopted into the pool so its first bind baselines only.
   */
  initial?: { sheetPath: string; session: KicadDocSession; editorMatchesDoc: boolean };
}

/** One warm room. `binding` is non-null ONLY while this is the active sheet. */
interface Room {
  session: KicadDocSession;
  doc: Y.Doc;
  binding?: KicadBinding;
  /** Flipped on first activation (seeded/adopted into the editor at least once). */
  seeded: boolean;
  /** ydoc-entry sheet: its open file was materialized from this doc (baseline-only). */
  editorMatchesDoc: boolean;
  /** A remote update arrived while this sheet was parked → catch-up adopt on next bind. */
  dirty: boolean;
  /** Active only while parked: marks `dirty` on remote doc updates. */
  detachWatch?: () => void;
}

export function createSheetCollabManager(opts: SheetManagerOptions): SheetCollabManager {
  const { mod, win, projectId, provider, seedDocForPath, log } = opts;
  const bridge = moduleItemsBridge(mod, win);
  const rooms = new Map<string, Room>();
  // In-flight connects, so connectAll() and switchTo() racing on the same sheet (api
  // mode, entry sheet) share ONE connection instead of opening the room twice.
  const connecting = new Map<string, Promise<Room>>();
  let activePath: string | null = null;

  // Coalesce rapid navigations: only the LATEST requested sheet is actually bound, and
  // switches run one-at-a-time so concurrent `onSheetChanged` events can't interleave.
  let requestedPath: string | null = null;
  let queue: Promise<void> = Promise.resolve();
  // Failed-switch retry backoff (bug 07): a failed ensureRoom used to leave the
  // editor unbound forever — every subsequent edit unsynced until the next manual
  // navigation. Event-driven retry, doubling 2s→30s, reset on any success.
  let retryDelayMs = 2000;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  if (opts.initial) {
    const { sheetPath, session, editorMatchesDoc } = opts.initial;
    rooms.set(sheetPath, {
      session,
      doc: session.doc,
      seeded: false,
      editorMatchesDoc,
      dirty: false,
    });
  }

  async function ensureRoom(sheetPath: string): Promise<Room> {
    const existing = rooms.get(sheetPath);
    if (existing) return existing;
    const inflight = connecting.get(sheetPath);
    if (inflight) return inflight;

    const pending = (async () => {
      const session = await connectKicadDoc({
        provider,
        room: collabRoomId(projectId, sheetPath),
      });
      const room: Room = {
        session,
        doc: session.doc,
        seeded: false,
        editorMatchesDoc: false,
        dirty: false,
      };
      rooms.set(sheetPath, room);
      log(`[sheet] warm room connected: ${sheetPath}`);
      return room;
    })();

    connecting.set(sheetPath, pending);
    try {
      return await pending;
    } finally {
      connecting.delete(sheetPath);
    }
  }

  // While a sheet is parked (no binding), any update to its doc is a remote edit (we
  // can't make local edits to a non-active screen). Flag it so the next bind catches up.
  function startWatch(room: Room): void {
    if (room.detachWatch) return;
    const onUpdate = () => {
      room.dirty = true;
    };
    room.doc.on("update", onUpdate);
    room.detachWatch = () => room.doc.off("update", onUpdate);
  }

  async function doSwitch(sheetPath: string): Promise<void> {
    if (activePath === sheetPath) return;

    // Detach the OLD binding FIRST (before any await): the editor already navigated to
    // the new sheet, so the old binding's observer must stop applying remote edits onto
    // what is now the wrong (new) active screen. Its provider/doc stay warm.
    if (activePath) {
      const old = rooms.get(activePath);
      if (old?.binding) {
        old.binding.destroy();
        old.binding = undefined;
        startWatch(old);
      }
    }
    activePath = null;

    const room = await ensureRoom(sheetPath);

    // Activating: stop tracking parked updates and bind the (warm) doc to the editor.
    room.detachWatch?.();
    room.detachWatch = undefined;

    const binding = bindKicadCollab(room.doc, bridge);
    room.binding = binding;

    if (!room.seeded) {
      // First activation: file-seed an empty room, else adopt peer/server state.
      binding.seed(seedDocForPath(sheetPath), { editorMatchesDoc: room.editorMatchesDoc });
      room.seeded = true;
      clog(`[sheet] seeded ${sheetPath} (editorMatchesDoc=${room.editorMatchesDoc})`);
    } else if (room.dirty) {
      // Remote edits landed while parked: adopt to catch the editor's screen up.
      binding.seed(undefined, { editorMatchesDoc: false });
      clog(`[sheet] re-adopted ${sheetPath} (caught up parked remote edits)`);
    } else {
      // Clean revisit: the editor screen already matches the doc — baseline the differ
      // (rebound after the C++ rebaseline on navigation), no full re-apply.
      binding.seed(undefined, { editorMatchesDoc: true });
      clog(`[sheet] rebound ${sheetPath} (no apply)`);
    }

    room.dirty = false;
    room.editorMatchesDoc = false; // only meaningful for the first ydoc-entry seed
    activePath = sheetPath;
    opts.onActiveChange?.({ sheetPath, doc: room.doc });
  }

  function switchTo(sheetPath: string): Promise<void> {
    requestedPath = sheetPath;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    queue = queue
      .then(() => {
        // Superseded by a newer navigation — skip this stale switch. The editor's active
        // screen always reflects `requestedPath`, so we only bind when they agree (the
        // seed/snapshot then reads the right screen).
        if (requestedPath !== sheetPath) return;
        return doSwitch(sheetPath).then(() => {
          retryDelayMs = 2000; // bound succeeded — reset the backoff
        });
      })
      .catch((err) => {
        cwarn(`[sheet] switchTo(${sheetPath}) failed`, err);
        // Still the sheet the editor shows and not yet bound → retry with backoff,
        // else the editor stays unbound and every edit silently never syncs.
        if (requestedPath === sheetPath && activePath !== sheetPath) {
          retryTimer = setTimeout(() => {
            retryTimer = undefined;
            if (requestedPath === sheetPath && activePath !== sheetPath) {
              log(`[sheet] retrying switch to ${sheetPath}`);
              void switchTo(sheetPath);
            }
          }, retryDelayMs);
          retryDelayMs = Math.min(retryDelayMs * 2, 30000);
        }
      });
    return queue;
  }

  async function onboard(sheetPath: string): Promise<void> {
    if (rooms.has(sheetPath)) return;
    log(`[sheet] onboarding new sheet ${sheetPath}`);
    try {
      await ensureRoom(sheetPath);
    } catch (err) {
      cwarn(`[sheet] onboard(${sheetPath}) failed`, err);
    }
  }

  async function connectAll(sheetPaths: string[]): Promise<void> {
    await Promise.all(
      sheetPaths.map((p) =>
        ensureRoom(p).catch((err) => {
          cwarn(`[sheet] failed to warm ${p}`, err);
          return null;
        }),
      ),
    );
  }

  function active(): { sheetPath: string; doc: Y.Doc } | null {
    if (!activePath) return null;
    const room = rooms.get(activePath);
    return room ? { sheetPath: activePath, doc: room.doc } : null;
  }

  function destroy(): void {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    for (const [path, room] of rooms) {
      try {
        room.detachWatch?.();
        room.binding?.destroy();
        room.session.provider.destroy();
        room.doc.destroy();
      } catch (err) {
        cwarn(`[sheet] destroy ${path} failed`, err);
      }
    }
    rooms.clear();
    activePath = null;
    requestedPath = null;
    opts.onActiveChange?.(null);
  }

  return { connectAll, switchTo, onboard, active, destroy };
}

export interface SheetChangedWindow {
  kicadCollab?: { onSheetChanged?: (absPath: string) => void };
}

/**
 * Register the C++ → JS sheet-navigation sink (`window.kicadCollab.onSheetChanged`),
 * fired from eeschema's `DisplayCurrentSheet` with the now-active screen's file path.
 * Spread-merges so sibling hooks (onSave / onItems) registered before or after survive.
 */
export function registerSheetChangedHook(
  win: SheetChangedWindow,
  onSheetChanged: (absPath: string) => void,
): void {
  win.kicadCollab = { ...win.kicadCollab, onSheetChanged };
}

export interface SheetCreatedWindow {
  kicadCollab?: { onSheetCreated?: (absPath: string) => void };
}

/**
 * Register the C++ → JS sheet-CREATION sink (`window.kicadCollab.onSheetCreated`), fired
 * when eeschema adds a hierarchical sheet — the child .kicad_sch has just been written to
 * MEMFS by the hook. The handler registers that child with the backend + warms its room,
 * so a subsheet that's placed but never entered or saved still persists. Spread-merges so
 * sibling hooks survive.
 */
export function registerSheetCreatedHook(
  win: SheetCreatedWindow,
  onSheetCreated: (absPath: string) => void,
): void {
  win.kicadCollab = { ...win.kicadCollab, onSheetCreated };
}
