import { BlockingDialog } from "@/preflight/BlockingDialog";

/**
 * Terminal "not enough memory" UI for feature 0002 — shown after the OOM retry
 * chain hits MAX_RETRIES. Reuses 0001's blocking dialog for visual consistency.
 *
 * The copy is honest about the two limitations the spec calls out: a respawn
 * re-opens the same file but loses in-tab edits not yet pushed to the backend /
 * Y.Doc, and `window.close()` may not close the very first (user-opened) tab.
 */
export function MemoryExhaustedDialog({ onReload }: { onReload?: () => void }) {
  return (
    <BlockingDialog
      title="Your device ran out of memory"
      description="The editor tried to recover a few times but kept running out of memory, so it stopped to avoid looping. This design is likely too large for this device's available memory."
      reasons={[
        {
          title: "What you can try",
          detail:
            "Close other tabs and applications to free memory, use a desktop machine with more RAM, or open a smaller design.",
        },
        {
          title: "Unsaved changes",
          detail:
            "Edits that weren't yet synced to the server may be lost. Any older tab left open can still be closed manually.",
        },
      ]}
      primary={
        onReload
          ? { label: "Reload and try again", onClick: onReload }
          : undefined
      }
    />
  );
}
