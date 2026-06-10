import { BlockingDialog } from "@/preflight/BlockingDialog";

/**
 * Terminal "not enough memory" UI for feature 0002 — shown after the OOM retry
 * chain hits MAX_RETRIES. Reuses 0001's blocking dialog for visual consistency.
 *
 * Offers two manual actions:
 *   - "Open in a new tab" (primary): a user-gesture respawn in a fresh browsing
 *     context. This sometimes succeeds where the automatic in-place reload did
 *     not, because a brand-new tab is the most reliable way to actually release
 *     the OOM'd wasm heap (an in-place reload doesn't, reliably, in every
 *     browser — notably Firefox).
 *   - "Reload this tab" (secondary): the simple in-place retry.
 *
 * Copy is honest about lost unsaved edits (a respawn re-opens the same file but
 * loses in-tab edits not yet synced to the backend / Y.Doc).
 */
export function MemoryExhaustedDialog({
  onOpenNewTab,
  onReload,
}: {
  onOpenNewTab?: () => void;
  onReload?: () => void;
}) {
  return (
    <BlockingDialog
      title="Your device ran out of memory"
      description="The editor tried to recover a few times but kept running out of memory, so it stopped to avoid looping. This design is likely too large for this device's available memory."
      reasons={[
        {
          title: "Try a fresh tab",
          detail:
            "Opening the editor in a brand-new browser tab (and closing this one) sometimes frees enough memory to continue — especially in Firefox, where reloading in place may not fully release the previous session's memory.",
        },
        {
          title: "Free up memory",
          detail:
            "Close other tabs and applications, use a desktop machine with more RAM, or open a smaller design.",
        },
        {
          title: "Unsaved changes",
          detail:
            "Edits that weren't yet synced to the server may be lost. Any older tab left open can still be closed manually.",
        },
      ]}
      primary={
        onOpenNewTab
          ? { label: "Open in a new tab", onClick: onOpenNewTab }
          : undefined
      }
      secondary={
        onReload ? { label: "Reload this tab", onClick: onReload } : undefined
      }
    />
  );
}
