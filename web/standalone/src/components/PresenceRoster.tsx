import type { PresencePeer } from "@/wasm/collab/presence";

/**
 * "Who else is in this file" (collab-presence 0001/0003): a compact facepile of
 * the room's OTHER users, one colored initial-avatar per person, fed by the
 * collab session's awareness. For eeschema (per-sheet rooms + warm-pool
 * skeleton states) peers on a DIFFERENT sheet render dimmed, with the sheet
 * they're on in the tooltip. Rendered in the editor's top-right overlay stack
 * next to SourceChip; the parent hides it when there are no peers. Chip styling
 * mirrors SourceChip (solid fill + inset ring) so it is legible on any backdrop.
 */
const MAX_AVATARS = 5;

function sheetLabel(sheetPath?: string): string {
  if (!sheetPath) return "";
  const base = sheetPath.split("/").pop() ?? sheetPath;
  return base.replace(/\.kicad_sch$/, "");
}

export function PresenceRoster({
  peers,
  activeSheetPath,
}: {
  peers: PresencePeer[];
  /** eeschema: the sheet THIS client is on — peers elsewhere render dimmed. */
  activeSheetPath?: string;
}) {
  if (!peers.length) return null;

  const sameSheet = (p: PresencePeer) =>
    (p.sheetPath ?? undefined) === (activeSheetPath ?? undefined);
  // Same-sheet peers first, then elsewhere (dimmed) — stable within each group.
  const ordered = [...peers].sort((a, b) => Number(sameSheet(b)) - Number(sameSheet(a)));
  const names = ordered
    .map((p) =>
      sameSheet(p) ? p.user.name : `${p.user.name} (on ${sheetLabel(p.sheetPath) || "another sheet"})`,
    )
    .join(", ");
  const shown = ordered.slice(0, MAX_AVATARS);

  return (
    <span
      data-testid="presence-roster"
      title={`Also here: ${names}`}
      className="inline-flex items-center rounded-full bg-black/70 py-0.5 pl-1 pr-1.5 shadow-sm ring-1 ring-inset ring-white/20"
    >
      {shown.map((p) => (
        <span
          key={p.user.id}
          data-presence-user={p.user.id}
          data-presence-elsewhere={sameSheet(p) ? undefined : "1"}
          title={
            sameSheet(p)
              ? p.user.name
              : `${p.user.name} — on ${sheetLabel(p.sheetPath) || "another sheet"}`
          }
          style={{ backgroundColor: p.user.color }}
          className={`-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-black/50 first:ml-0 ${
            sameSheet(p) ? "" : "opacity-40"
          }`}
        >
          {p.user.name.charAt(0).toUpperCase()}
        </span>
      ))}
      {peers.length > MAX_AVATARS && (
        <span className="ml-1 text-[10px] font-medium text-white/80">
          +{peers.length - MAX_AVATARS}
        </span>
      )}
    </span>
  );
}
