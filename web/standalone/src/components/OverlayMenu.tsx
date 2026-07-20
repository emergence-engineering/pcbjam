import * as React from "react";
import { Users } from "lucide-react";

/**
 * Unified overlay menu (collab-presence 0010): the single circular icon that
 * replaces the old top-right overlay row. The FAB is draggable anywhere over
 * the canvas (pointer capture, 4px click-vs-drag threshold — the comment-pin
 * pattern), its position persists per browser, and its badge shows how many
 * OTHER users are in the session. Clicking opens a panel that stacks the
 * sections WasmTool composes as children (roster, source chip, view-only
 * pill, follow row, comments, chrome toggle, …) — adding a future section is
 * one more child. Renders above everything (z-50, including wx dialogs and
 * toasts) by decision: it is trivially dismissed (click-away, Esc, the FAB)
 * and can be dragged out of the way. Stays up in chrome-hidden mode — it is
 * the canvas-only survivor the chrome toggle used to be.
 *
 * VISUAL SYSTEM. The panel previously stacked whatever its children happened to
 * look like — free-floating pills of different heights, radii and surfaces, all
 * left-aligned with a gap. It read as debris rather than a menu. The primitives
 * below are the fix and the contract:
 *
 *   OverlayMenuSection — a labelled group, separated from its neighbours.
 *   overlayRowClass    — the shared row shape for anything interactive.
 *
 * Children compose these instead of inventing their own chrome. Two deliberate
 * exceptions stay self-styled because they are shared with light-background
 * pages (SourceChip) or own a nontrivial internal layout (PresenceRoster) —
 * those are wrapped in a section rather than restyled.
 */

/** Row shape for any interactive item in the panel. Full-width so the panel
 *  reads as a list; the hover/active states are the only affordance needed. */
export const overlayRowClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs " +
  "text-white/90 transition-colors hover:bg-white/10 " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40";

/** A labelled group. `label` is omitted for the first/unnamed group. */
export function OverlayMenuSection({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1 border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
      {label && (
        <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-white/40">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

const POS_KEY = "pcbjam:overlay-menu-pos";
const FAB_SIZE = 36;
const DRAG_THRESHOLD_PX = 4;

type Pos = { x: number; y: number };

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pos;
    return typeof p.x === "number" && typeof p.y === "number" ? p : null;
  } catch {
    return null;
  }
}

function clamp(p: Pos): Pos {
  return {
    x: Math.min(Math.max(p.x, 4), window.innerWidth - FAB_SIZE - 4),
    y: Math.min(Math.max(p.y, 4), window.innerHeight - FAB_SIZE - 4),
  };
}

export function OverlayMenu({
  badge,
  children,
}: {
  /** Peer count shown on the FAB (0 hides the badge). */
  badge: number;
  /** Panel sections, rendered top-to-bottom. Falsy children collapse. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<Pos | null>(() =>
    typeof window === "undefined" ? null : loadPos(),
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    fabX: number;
    fabY: number;
    moved: boolean;
  } | null>(null);

  // Esc closes (bubble phase, same etiquette as the comment layer — wx also
  // sees the key, matching how every other overlay treats Escape).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Click-away: any pointerdown outside the menu closes it (canvas included —
  // wx pointer handlers bind to #canvas, so this listener still fires).
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onFabPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = rootRef.current!.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      fabX: rect.x,
      fabY: rect.y,
      moved: false,
    };
  };

  const onFabPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      if (
        Math.hypot(e.clientX - d.startX, e.clientY - d.startY) <
        DRAG_THRESHOLD_PX
      ) {
        return;
      }
      d.moved = true;
      setOpen(false); // dragging repositions; the click that follows reopens
    }
    setPos(
      clamp({
        x: d.fabX + (e.clientX - d.startX),
        y: d.fabY + (e.clientY - d.startY),
      }),
    );
  };

  const onFabPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(p));
          } catch {
            /* private mode — position just doesn't persist */
          }
        }
        return p;
      });
    } else {
      setOpen((o) => !o);
    }
  };

  // Default anchor: top-right (the old row's home). After a drag, explicit px.
  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: 12, top: 12 };
  // The panel opens toward the screen's center from wherever the FAB sits.
  const onLeftHalf = pos ? pos.x < window.innerWidth / 2 : false;
  const onTopHalf = pos ? pos.y < window.innerHeight / 2 : true;

  return (
    <div ref={rootRef} className="absolute z-50" style={style}>
      <button
        type="button"
        data-testid="overlay-menu-fab"
        aria-expanded={open}
        title="Session menu — drag to move"
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg ring-1 ring-inset transition-colors ${
          open
            ? "bg-sky-600 ring-sky-300/40"
            : "bg-neutral-950/80 ring-white/15 backdrop-blur-sm hover:bg-neutral-900/90"
        }`}
        style={{ touchAction: "none" }}
      >
        <Users size={16} />
        {badge > 0 && (
          <span
            data-testid="overlay-menu-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-semibold text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="overlay-menu-panel"
          className={`absolute flex w-72 flex-col gap-2 rounded-xl bg-neutral-950/90 p-2 shadow-2xl ring-1 ring-inset ring-white/15 backdrop-blur-sm ${
            onLeftHalf ? "left-0" : "right-0"
          } ${onTopHalf ? "top-11" : "bottom-11"}`}
        >
          <div className="flex items-center justify-between px-2 pt-0.5">
            <span className="text-[11px] font-semibold tracking-wide text-white/70">
              Session
            </span>
            {badge > 0 && (
              <span className="text-[10px] text-white/40">
                {badge} {badge === 1 ? "other" : "others"} here
              </span>
            )}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
