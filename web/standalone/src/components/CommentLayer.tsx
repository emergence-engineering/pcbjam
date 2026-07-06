import * as React from "react";
import { colorForUser, type CommentAnchor } from "@pcbjam/shared";
import { MessageSquarePlus, MessageSquareText, X } from "lucide-react";
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
 * invisible click targets over each dot, the thread popover (read/reply/edit/
 * resolve/delete), the comment-mode click catcher + composer, and a small
 * list panel with jump-to. Positions map world→canvas-px via the exported
 * viewport transform, then canvas-px→CSS via the GAL panel's bounding rect
 * (`#glcanvas-*` — `#canvas` is the whole wx window). A ≤1-frame skew against
 * the GAL dot during pan is accepted; it only affects the hit target.
 */

interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
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

export function CommentLayer({
  controller,
  viewport,
  currentUser,
}: {
  controller: CommentsController;
  viewport: ViewportState | null;
  currentUser: string;
}) {
  const [threads, setThreads] = React.useState<ResolvedThread[]>(controller.threads());
  const [mode, setMode] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState(false);
  const [showResolved, setShowResolved] = React.useState(false);
  const [draft, setDraft] = React.useState<{ anchor: CommentAnchor; css: { x: number; y: number } } | null>(null);
  // The GAL panel's CSS rect — re-measured on viewport pushes + window resize.
  const [glRect, setGlRect] = React.useState<CssRect | null>(null);

  // Re-seed on controller rebind (eeschema sheet switch swaps the controller;
  // the useState initializer only covers the first mount).
  React.useEffect(() => {
    setThreads(controller.threads());
    setOpenId(null);
    setDraft(null);
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

  const onModeClick = (e: React.MouseEvent) => {
    if (!viewport || !glRect) return;
    const px = {
      x: (e.clientX - glRect.x) / cssRatio,
      y: (e.clientY - glRect.y) / cssRatio,
    };
    const world = screenToWorld(viewport, px);
    // Snap to an item within ~14 CSS px so the pin tracks the obvious target.
    const maxDistIu = 14 / (viewport.scale * cssRatio);
    setDraft({ anchor: controller.anchorAt(world, maxDistIu), css: { x: e.clientX, y: e.clientY } });
    setMode(false);
  };

  const open = openId ? threads.find((t) => t.id === openId) : undefined;
  // A thread opened from the panel may sit off-screen (jump-to clamps at the
  // view bounds) — fall back to a centered popover rather than rendering none.
  const openCss = open
    ? (toCss(open.world) ?? { x: window.innerWidth / 2 - 150, y: 120 })
    : null;
  const visibleThreads = threads.filter((t) => showResolved || !t.resolved);

  return (
    <>
      {/* Mode + panel toggles, below the top-right chips. */}
      <div className="absolute right-3 top-12 z-30 flex flex-col items-end gap-2">
        <button
          data-testid="comment-mode-toggle"
          title={mode ? "Cancel comment (Esc)" : "Add a comment"}
          onClick={() => {
            setMode((m) => !m);
            setDraft(null);
          }}
          className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm ring-1 ring-inset ring-white/20 ${
            mode ? "bg-amber-500 text-black" : "bg-black/70 text-white hover:bg-black/85"
          }`}
        >
          <MessageSquarePlus size={16} />
        </button>
        <button
          data-testid="comment-panel-toggle"
          title="Comments"
          onClick={() => setPanel((p) => !p)}
          className="flex h-8 min-w-8 items-center justify-center gap-1 rounded-full bg-black/70 px-2 text-xs text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-black/85"
        >
          <MessageSquareText size={14} />
          {threads.length > 0 && <span>{threads.length}</span>}
        </button>
      </div>

      {/* Comment-mode click catcher over the drawing area only. */}
      {mode && glRect && (
        <div
          data-testid="comment-click-catcher"
          className="absolute z-30 cursor-crosshair"
          style={{ left: glRect.x, top: glRect.y, width: glRect.width, height: glRect.height }}
          onClick={onModeClick}
        />
      )}

      {/* Pin hit targets (the visual dot is GAL — these are the clickable DOM halves). */}
      {visibleThreads.map((t) => {
        const css = toCss(t.world);
        if (!css) return null;
        return (
          <button
            key={t.id}
            data-testid="comment-pin"
            data-thread-id={t.id}
            title={`${t.createdBy}: ${t.messages[0]?.body ?? ""}${t.detached ? " (detached)" : ""}`}
            onClick={() => setOpenId((cur) => (cur === t.id ? null : t.id))}
            className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full hover:ring-2 hover:ring-white/70"
            style={{ left: css.x, top: css.y, width: 22, height: 22, background: "transparent" }}
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
      {open && openCss && (
        <ThreadPopover
          thread={open}
          css={openCss}
          currentUser={currentUser}
          controller={controller}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Threads panel (filter + jump-to). */}
      {panel && (
        <div className="absolute right-3 top-24 z-30 flex max-h-[60vh] w-72 flex-col overflow-hidden rounded-lg bg-black/85 text-white shadow-lg ring-1 ring-inset ring-white/20">
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
                  controller.jumpTo(t.id);
                  setOpenId(t.id);
                }}
                className="block w-full border-t border-white/10 px-3 py-2 text-left text-xs hover:bg-white/10"
              >
                <span className="font-semibold" style={{ color: colorForUser(t.createdBy) }}>
                  {t.createdBy}
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

  return (
    <div
      data-testid="comment-popover"
      className="absolute z-40 w-72 rounded-lg bg-black/90 text-white shadow-lg ring-1 ring-inset ring-white/20"
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
              <span className="font-semibold" style={{ color: colorForUser(m.author) }}>
                {m.author}
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
