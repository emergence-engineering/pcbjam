import type * as Y from "yjs";
import {
  addMessage,
  args,
  colorForUser,
  createThread,
  deleteThread,
  editMessage,
  field,
  kicadItemsMap,
  listThreads,
  observeComments,
  removeMessage,
  resolveAnchor,
  setThreadResolved,
  yToItemUnchecked,
  type CommentAnchor,
  type CommentThread,
} from "@pcbjam/shared";
import { clog } from "./debug";

/**
 * Comments controller (collab-presence 0005): glues the MIT `kdoc_comments`
 * helpers (0004) to the editor —
 *   - resolves every thread's anchor to a world position (tracking anchored
 *     items through `kdoc_items` changes),
 *   - feeds the GAL pin dots (`Module.kicadCollabSetPins`, throttled snapshot,
 *     same idempotent contract as the presence overlay),
 *   - exposes the threads + CRUD to the React layer (CommentLayer).
 * One controller per bound doc; eeschema rebinds it per sheet, exactly like
 * presence.
 */

/** File-mm → editor-IU factor per tool (anchors store IU; item slots store mm). */
export const IU_PER_MM: Record<string, number> = {
  pcbnew: 1e6,
  eeschema: 1e4,
};

export interface CommentPinsModule {
  kicadCollabSetPins(json: string): void;
  kicadCollabSetViewport(cx: number, cy: number): void;
  kicadCollabGetViewport(): string;
}

/** True when the loaded wasm exposes the comment-pin bridge (0005 exports). */
export function hasCommentsBridge(mod: unknown): mod is CommentPinsModule {
  const m = mod as Partial<CommentPinsModule> | undefined;
  return (
    typeof m?.kicadCollabSetPins === "function" &&
    typeof m?.kicadCollabSetViewport === "function"
  );
}

/** The GAL viewport transform (see presence-kicad ViewportState). */
export interface ViewportState {
  cx: number;
  cy: number;
  scale: number; // px per IU (canvas device px)
  w: number;
  h: number;
}

/** World IU → canvas px (the GAL panel's own pixel space). */
export function worldToScreen(vp: ViewportState, p: { x: number; y: number }) {
  return {
    x: (p.x - vp.cx) * vp.scale + vp.w / 2,
    y: (p.y - vp.cy) * vp.scale + vp.h / 2,
  };
}

/** Canvas px → world IU. */
export function screenToWorld(vp: ViewportState, p: { x: number; y: number }) {
  return {
    x: (p.x - vp.w / 2) / vp.scale + vp.cx,
    y: (p.y - vp.h / 2) / vp.scale + vp.cy,
  };
}

/** A thread with its anchor resolved to the current world position. */
export interface ResolvedThread extends CommentThread {
  world: { x: number; y: number };
  detached: boolean;
}

export interface CommentsController {
  threads(): ResolvedThread[];
  subscribe(cb: (threads: ResolvedThread[]) => void): () => void;
  /** Build an anchor for a world-pos click: nearest positioned item within
   *  `maxDistIu` becomes the tracked anchor (+offset), else pos-only. */
  anchorAt(world: { x: number; y: number }, maxDistIu: number): CommentAnchor;
  create(anchor: CommentAnchor, body: string): string;
  reply(threadId: string, body: string): void;
  edit(threadId: string, messageId: string, body: string): boolean;
  remove(threadId: string, messageId: string): "removed" | "thread-deleted" | false;
  setResolved(threadId: string, resolved: boolean): void;
  deleteThread(threadId: string): void;
  /** Pan the editor to a thread's pin (comment panel "jump to"). */
  jumpTo(threadId: string): void;
  destroy(): void;
}

const PUSH_THROTTLE_MS = 30;

export function createComments(opts: {
  doc: Y.Doc;
  mod: CommentPinsModule;
  /** Author slug for new messages (presence identity). */
  user: string;
  tool: string;
}): CommentsController {
  const { doc, mod, user } = opts;
  const iuPerMm = IU_PER_MM[opts.tool] ?? 1e6;

  let cache: ResolvedThread[] = [];
  const subscribers = new Set<(threads: ResolvedThread[]) => void>();

  const recompute = (): ResolvedThread[] => {
    cache = listThreads(doc).map((t) => {
      const { x, y, detached } = resolveAnchor(doc, t.anchor, iuPerMm);
      return { ...t, world: { x, y }, detached };
    });
    return cache;
  };

  const pushPins = () => {
    mod.kicadCollabSetPins(
      JSON.stringify({
        // Resolved threads drop their dot (figma-style) — they stay reachable
        // through the panel's "resolved" filter. Matches the DOM hit targets.
        pins: cache
          .filter((t) => !t.resolved)
          .map((t) => ({
            id: t.id,
            x: t.world.x,
            y: t.world.y,
            color: colorForUser(t.createdBy),
            resolved: t.resolved,
          })),
      }),
    );
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      recompute();
      pushPins();
      for (const cb of subscribers) cb(cache);
    }, PUSH_THROTTLE_MS);
  };

  // Threads change → re-render; anchored ITEMS change (moves) → pins follow.
  const offComments = observeComments(doc, schedule);
  const items = kicadItemsMap(doc);
  const onItems = () => schedule();
  items.observeDeep(onItems);

  recompute();
  pushPins();
  clog("comments: controller bound,", cache.length, "thread(s)");

  return {
    threads: () => cache,
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    anchorAt(world, maxDistIu) {
      let best: { uuid: string; pos: { x: number; y: number }; d2: number } | null = null;

      for (const [uuid, ym] of items) {
        const item = yToItemUnchecked(ym);
        const at = field(item.body, "at");
        const [xs, ys] = at ? args(at) : [];
        const x = Number(xs) * iuPerMm;
        const y = Number(ys) * iuPerMm;

        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        const d2 = (x - world.x) ** 2 + (y - world.y) ** 2;

        if (d2 <= maxDistIu * maxDistIu && (!best || d2 < best.d2)) {
          best = { uuid, pos: { x, y }, d2 };
        }
      }

      if (best) {
        return {
          itemUuid: best.uuid,
          pos: { x: world.x, y: world.y },
          offset: { x: world.x - best.pos.x, y: world.y - best.pos.y },
        };
      }

      return { pos: { x: world.x, y: world.y } };
    },
    create(anchor, body) {
      return createThread(doc, { anchor, author: user, body });
    },
    reply(threadId, body) {
      addMessage(doc, threadId, { author: user, body });
    },
    edit(threadId, messageId, body) {
      return editMessage(doc, threadId, messageId, body);
    },
    remove(threadId, messageId) {
      return removeMessage(doc, threadId, messageId);
    },
    setResolved(threadId, resolved) {
      setThreadResolved(doc, threadId, resolved);
    },
    deleteThread(threadId) {
      deleteThread(doc, threadId);
    },
    jumpTo(threadId) {
      const t = cache.find((x) => x.id === threadId);
      if (t) mod.kicadCollabSetViewport(t.world.x, t.world.y);
    },
    destroy() {
      offComments();
      items.unobserveDeep(onItems);
      subscribers.clear();
      if (timer) clearTimeout(timer);
      timer = undefined;
      try {
        mod.kicadCollabSetPins(JSON.stringify({ pins: [] }));
      } catch {
        /* wasm may already be gone on teardown */
      }
    },
  };
}
