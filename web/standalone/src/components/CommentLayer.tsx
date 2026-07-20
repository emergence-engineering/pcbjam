import * as React from "react";
import { createPortal } from "react-dom";
import { overlayRowClass } from "@/components/OverlayMenu";
import type { CommentAnchor } from "@pcbjam/shared";
import { Eye, EyeOff, List, MessageSquarePlus, X } from "lucide-react";
import {
  screenToWorld,
  worldToScreen,
  type CommentsController,
  type ResolvedThread,
  type ViewportState,
} from "@/wasm/collab/comments";

/**
 * DOM half of the hybrid comment pins (collab-presence 0005): the GAL overlay
 * draws the dots (zero pan/zoom lag); this layer adds what DOM does better —
 * click/drag targets over each dot, the thread popover (read/reply/edit/
 * resolve/delete), the comment-mode click catcher + composer, and the list
 * panel. One comment icon (top-right) expands into a small horizontal bar:
 * new comment · list · show/hide all. Pins are draggable — the anchor is
 * re-written live while dragging (LWW), and re-snapped to the nearest item on
 * drop. Positions map world→canvas-px via the exported viewport transform,
 * then canvas-px→CSS via the GAL panel's bounding rect (`#glcanvas-*`).
 */

interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}


/**
 * What to show for a comment author, and what to reveal on hover.
 *
 * `author`/`createdBy` is the SLUG — the identity key used for colors and
 * ownership. It is what used to be rendered, which is why comments showed a
 * scope-looking string instead of a person. Prefer the denormalized display
 * name; legacy messages (written before authorName existed) have none and fall
 * back to the slug, so old threads keep working.
 */
function authorLabel(a: { author?: string; createdBy?: string; authorName?: string; authorEmail?: string }): {
  text: string;
  title: string;
} {
  const slug = a.author ?? a.createdBy ?? "";
  const text = a.authorName || slug;
  // Tooltip: email when we captured one, otherwise the slug — always something
  // more identifying than the label itself.
  const title = a.authorEmail ? `${text} <${a.authorEmail}>` : slug;
  return { text, title };
}

function glCanvasRect(): CssRect | null {
  const el = Array.from(document.querySelectorAll('[id^="glcanvas-"]')).find((c) => {
    const r = (c as HTMLElement).getBoundingClientRect();
    return getComputedStyle(c as HTMLElement).display !== "none" && r.width > 0;
  }) as HTMLElement | undefined;

  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const DRAG_THRESHOLD_PX = 4;
const DRAG_SYNC_MS = 60;

export function CommentLayer({
  controller,
  viewport,
  currentUser,
  menuSlot,
}: {
  controller: CommentsController;
  viewport: ViewportState | null;
  currentUser: string;
  /** The overlay menu's comments section (0010): the bar + list panel portal
   *  into it while the menu is open; null (menu closed) renders neither.
   *  Pins, popovers, composer and the click catcher stay canvas-anchored. */
  menuSlot: HTMLElement | null;
}) {
  const [threads, setThreads] = React.useState<ResolvedThread[]>(controller.threads());
  const [mode, setMode] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState(false);
  const [showResolved, setShowResolved] = React.useState(false);
  const [hidden, setHidden] = React.useState(!controller.pinsVisible());
  const [draft, setDraft] = React.useState<{ anchor: CommentAnchor; css: { x: number; y: number } } | null>(null);
  // The GAL panel's CSS rect — re-measured on viewport pushes + window resize.
  const [glRect, setGlRect] = React.useState<CssRect | null>(null);
  // Live drag state: the dragged thread follows the pointer in CSS space (the
  // GAL dot follows through the throttled anchor writes).
  const [drag, setDrag] = React.useState<{ id: string; css: { x: number; y: number } } | null>(null);
  const dragRef = React.useRef<{
    id: string;
    startX: number;
    startY: number;
    moved: boolean;
    lastSync: number;
  } | null>(null);

  // Re-seed on controller rebind (eeschema sheet switch swaps the controller;
  // the useState initializer only covers the first mount).
  React.useEffect(() => {
    setThreads(controller.threads());
    setOpenId(null);
    setDraft(null);
    setHidden(!controller.pinsVisible());
    return controller.subscribe(setThreads);
  }, [controller]);

  React.useEffect(() => {
    const measure = () => setGlRect(glCanvasRect());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [viewport]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode(false);
        setDraft(null);
        setOpenId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cssRatio = viewport && glRect ? glRect.width / viewport.w : 1;

  const toCss = (world: { x: number; y: number }) => {
    if (!viewport || !glRect) return null;
    const px = worldToScreen(viewport, world);
    const x = glRect.x + px.x * cssRatio;
    const y = glRect.y + px.y * cssRatio;
    if (x < glRect.x - 20 || x > glRect.x + glRect.width + 20) return null;
    if (y < glRect.y - 20 || y > glRect.y + glRect.height + 20) return null;
    return { x, y };
  };

  const cssToWorld = (css: { x: number; y: number }) => {
    if (!viewport || !glRect) return null;
    return screenToWorld(viewport, {
      x: (css.x - glRect.x) / cssRatio,
      y: (css.y - glRect.y) / cssRatio,
    });
  };

  const snapRadiusIu = () =>
    viewport ? 14 / (viewport.scale * cssRatio) : 0;

  const onModeClick = (e: React.MouseEvent) => {
    const world = cssToWorld({ x: e.clientX, y: e.clientY });
    if (!world) return;
    setDraft({
      anchor: controller.anchorAt(world, snapRadiusIu()),
      css: { x: e.clientX, y: e.clientY },
    });
    setMode(false);
  };

  // ── pin dragging ────────────────────────────────────────────────────────
  const onPinPointerDown = (t: ResolvedThread) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: t.id, startX: e.clientX, startY: e.clientY, moved: false, lastSync: 0 };
  };

  const onPinPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      setOpenId(null);
    }
    setDrag({ id: d.id, css: { x: e.clientX, y: e.clientY } });
    // Throttled live re-anchor (pos-only while dragging — snap happens on
    // drop) so the GAL dot and every peer follow the drag.
    const now = Date.now();
    if (now - d.lastSync >= DRAG_SYNC_MS) {
      d.lastSync = now;
      const world = cssToWorld({ x: e.clientX, y: e.clientY });
      if (world) controller.moveThread(d.id, { pos: world });
    }
  };

  const onPinPointerUp = (t: ResolvedThread) => (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (d.moved) {
      const world = cssToWorld({ x: e.clientX, y: e.clientY });
      if (world) controller.moveThread(t.id, controller.anchorAt(world, snapRadiusIu()));
    } else {
      setOpenId((cur) => (cur === t.id ? null : t.id));
    }
  };

  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    controller.setPinsVisible(!next);
    if (next) {
      setOpenId(null);
      setMode(false);
      setDraft(null);
    }
  };

  const open = openId ? threads.find((t) => t.id === openId) : undefined;
  // A thread opened from the panel may sit off-screen (jump-to clamps at the
  // view bounds) — fall back to a centered popover rather than rendering none.
  const openCss = open
    ? (toCss(open.world) ?? { x: window.innerWidth / 2 - 150, y: 120 })
    : null;
  const visibleThreads = threads.filter((t) => showResolved || !t.resolved);
  const pinThreads = hidden ? [] : visibleThreads;

  // Comment toolbar + list panel: portaled into the overlay menu's comments
  // slot (0010) while the menu is open — in-flow there, not absolute.
  const menuUi = menuSlot
    ? createPortal(
        <>
          {/* The overlay menu's "Comments" section IS the group, so there is no
              nested open/close toggle here any more — that was a collapsible
              inside a collapsible. And every action is a LABELLED row: the old
              bar was four bare icons whose meanings you had to hover to learn. */}
          <div className="flex w-full flex-col">
            <button
              data-testid="comment-mode-toggle"
              aria-pressed={mode}
              title={mode ? "Cancel (Esc)" : "Click the canvas to place a pin"}
              onClick={() => {
                if (hidden) toggleHidden();
                setMode((m) => !m);
                setDraft(null);
              }}
              className={`${overlayRowClass} ${mode ? "bg-amber-500/20 text-amber-200" : ""}`}
            >
              <MessageSquarePlus size={14} className="shrink-0 text-white/50" />
              <span>{mode ? "Placing comment…" : "Add comment"}</span>
              <span className="ml-auto text-[10px] text-white/40">
                {mode ? "Esc" : ""}
              </span>
            </button>

            <button
              data-testid="comment-panel-toggle"
              aria-pressed={panel}
              title="Show every comment in this file"
              onClick={() => setPanel((p) => !p)}
              className={`${overlayRowClass} ${panel ? "bg-white/10" : ""}`}
            >
              <List size={14} className="shrink-0 text-white/50" />
              <span>{panel ? "Hide list" : "Show list"}</span>
              <span className="ml-auto text-[10px] text-white/40">
                {threads.length}
              </span>
            </button>

            <button
              data-testid="comment-visibility-toggle"
              aria-pressed={!hidden}
              title={hidden ? "Show the pins on the canvas" : "Hide the pins on the canvas"}
              onClick={toggleHidden}
              className={overlayRowClass}
            >
              {hidden ? (
                <EyeOff size={14} className="shrink-0 text-white/50" />
              ) : (
                <Eye size={14} className="shrink-0 text-white/50" />
              )}
              <span>{hidden ? "Show pins" : "Hide pins"}</span>
            </button>
          </div>

          {/* Threads panel (filter + jump-to). */}
          {panel && (
            <div className="flex max-h-[50vh] w-full flex-col overflow-hidden rounded-lg bg-black/60 text-white ring-1 ring-inset ring-white/15">
              <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold">
                <span>Comments ({visibleThreads.length})</span>
                <label className="flex items-center gap-1 font-normal text-white/70">
                  <input
                    data-testid="comment-show-resolved"
                    type="checkbox"
                    checked={showResolved}
                    onChange={(e) => setShowResolved(e.target.checked)}
                  />
                  resolved
                </label>
              </div>
              <div className="overflow-y-auto">
                {visibleThreads.length === 0 && (
                  <p className="px-3 pb-3 text-xs text-white/50">No comments yet.</p>
                )}
                {visibleThreads.map((t) => (
                  <button
                    key={t.id}
                    data-testid="comment-panel-item"
                    onClick={() => {
                      if (hidden) toggleHidden();
                      controller.jumpTo(t.id);
                      setOpenId(t.id);
                    }}
                    className="block w-full border-t border-white/10 px-3 py-2 text-left text-xs hover:bg-white/10"
                  >
                    <span
                      className="font-semibold"
                      style={{ color: controller.colorFor(t.createdBy) }}
                      title={authorLabel(t).title}
                    >
                      {authorLabel(t).text}
                    </span>{" "}
                    <span className="text-white/50">
                      {timeAgo(t.createdAt)} ago{t.resolved ? " · resolved" : ""}
                    </span>
                    <span className="mt-0.5 block truncate text-white/90">
                      {t.messages[0]?.body ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>,
        menuSlot,
      )
    : null;

  return (
    <>
      {menuUi}

      {/* Comment-mode click catcher over the drawing area only. */}
      {mode && glRect && (
        <div
          data-testid="comment-click-catcher"
          className="absolute z-30 cursor-crosshair"
          style={{ left: glRect.x, top: glRect.y, width: glRect.width, height: glRect.height }}
          onClick={onModeClick}
        />
      )}

      {/* Pin hit/drag targets (the visual dot is GAL — these are the DOM halves). */}
      {pinThreads.map((t) => {
        const css = drag?.id === t.id ? drag.css : toCss(t.world);
        if (!css) return null;
        return (
          <button
            key={t.id}
            data-testid="comment-pin"
            data-thread-id={t.id}
            title={`${authorLabel(t).text}: ${t.messages[0]?.body ?? ""}${t.detached ? " (detached)" : ""} — drag to move`}
            onPointerDown={onPinPointerDown(t)}
            onPointerMove={onPinPointerMove}
            onPointerUp={onPinPointerUp(t)}
            className={`absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full ${
              drag?.id === t.id ? "cursor-grabbing ring-2 ring-white" : "cursor-grab hover:ring-2 hover:ring-white/70"
            }`}
            style={{ left: css.x, top: css.y, width: 22, height: 22, background: "transparent", touchAction: "none" }}
          />
        );
      })}

      {/* New-comment composer at the clicked point. */}
      {draft && (
        <Composer
          css={draft.css}
          onCancel={() => setDraft(null)}
          onSubmit={(body) => {
            const id = controller.create(draft.anchor, body);
            setDraft(null);
            setOpenId(id);
          }}
        />
      )}

      {/* Thread popover next to its pin. */}
      {open && openCss && !hidden && (
        <ThreadPopover
          thread={open}
          css={openCss}
          currentUser={currentUser}
          controller={controller}
          onClose={() => setOpenId(null)}
        />
      )}

    </>
  );
}

function Composer({
  css,
  onSubmit,
  onCancel,
}: {
  css: { x: number; y: number };
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = React.useState("");
  const submit = () => {
    if (body.trim()) onSubmit(body.trim());
    else onCancel();
  };
  return (
    <div
      data-testid="comment-composer"
      className="absolute z-40 w-64 rounded-lg bg-black/90 p-2 shadow-lg ring-1 ring-inset ring-white/20"
      style={{ left: Math.min(css.x + 12, window.innerWidth - 280), top: Math.min(css.y, window.innerHeight - 120) }}
    >
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a comment…"
        className="h-16 w-full resize-none rounded bg-white/10 p-2 text-xs text-white placeholder-white/40 outline-none"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10">
          Cancel
        </button>
        <button
          data-testid="comment-submit"
          onClick={submit}
          className="rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-500"
        >
          Comment
        </button>
      </div>
    </div>
  );
}

function ThreadPopover({
  thread,
  css,
  currentUser,
  controller,
  onClose,
}: {
  thread: ResolvedThread;
  css: { x: number; y: number };
  currentUser: string;
  controller: CommentsController;
  onClose: () => void;
}) {
  const [reply, setReply] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null);

  const sendReply = () => {
    if (reply.trim()) {
      controller.reply(thread.id, reply.trim());
      setReply("");
    }
  };

  // z-[60] beats the overlay menu's z-50 ON PURPOSE: the menu panel is tall
  // enough to cover a pin popover, and a popover can be opened FROM the menu
  // (the thread list's jump-to), so the menu would otherwise swallow clicks on
  // the popover it just spawned. The focused surface wins; the menu stays one
  // click-away from dismissal.
  return (
    <div
      data-testid="comment-popover"
      className="absolute z-[60] w-72 rounded-lg bg-black/90 text-white shadow-lg ring-1 ring-inset ring-white/20"
      style={{
        left: Math.min(css.x + 16, window.innerWidth - 300),
        top: Math.min(css.y - 8, window.innerHeight - 260),
      }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-white/60">
          {thread.detached && "detached pin · "}
          {thread.resolved ? "resolved" : "open"}
        </span>
        <div className="flex items-center gap-2">
          <button
            data-testid="comment-resolve"
            onClick={() => controller.setResolved(thread.id, !thread.resolved)}
            className="rounded px-1.5 py-0.5 text-[11px] text-white/80 ring-1 ring-inset ring-white/25 hover:bg-white/10"
          >
            {thread.resolved ? "Reopen" : "Resolve"}
          </button>
          {thread.createdBy === currentUser && (
            <button
              data-testid="comment-delete-thread"
              title="Delete thread"
              onClick={() => {
                controller.deleteThread(thread.id);
                onClose();
              }}
              className="rounded px-1.5 py-0.5 text-[11px] text-red-300 ring-1 ring-inset ring-red-400/40 hover:bg-red-500/20"
            >
              Delete
            </button>
          )}
          <button onClick={onClose} title="Close" className="text-white/60 hover:text-white">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto border-t border-white/10">
        {thread.messages.map((m) => (
          <div key={m.id} data-testid="comment-message" className="group px-3 py-2 text-xs">
            <div className="flex items-baseline gap-2">
              <span
                className="font-semibold"
                style={{ color: controller.colorFor(m.author) }}
                title={authorLabel(m).title}
              >
                {authorLabel(m).text}
              </span>
              <span className="text-[10px] text-white/40">
                {timeAgo(m.createdAt)} ago{m.editedAt ? " · edited" : ""}
              </span>
              {m.author === currentUser && (
                <span className="ml-auto hidden gap-1 group-hover:flex">
                  <button
                    data-testid="comment-edit"
                    onClick={() => setEditing({ id: m.id, body: m.body })}
                    className="text-[10px] text-white/60 hover:text-white"
                  >
                    edit
                  </button>
                  <button
                    data-testid="comment-remove"
                    onClick={() => {
                      if (controller.remove(thread.id, m.id) === "thread-deleted") onClose();
                    }}
                    className="text-[10px] text-red-300/80 hover:text-red-300"
                  >
                    delete
                  </button>
                </span>
              )}
            </div>
            {editing?.id === m.id ? (
              <div className="mt-1">
                <textarea
                  autoFocus
                  value={editing.body}
                  onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      controller.edit(thread.id, m.id, editing.body.trim());
                      setEditing(null);
                    }
                  }}
                  className="h-12 w-full resize-none rounded bg-white/10 p-1.5 text-xs text-white outline-none"
                />
              </div>
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap text-white/90">{m.body}</p>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 p-2">
        <input
          data-testid="comment-reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendReply();
          }}
          placeholder="Reply…"
          className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder-white/40 outline-none"
        />
      </div>
    </div>
  );
}
