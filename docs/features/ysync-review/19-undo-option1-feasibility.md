# Research 19 — Feasibility of miss-09 option 1: exclude remote applies from undo

**Status:** research (2026-07-07), not implemented
**Verdict:** moderately hard but tractable — ~3–5 days. The pointer-invalidation risk
[09](09-miss-undo-not-collab-aware.md) flagged is already solved on the pcbnew side;
the core work is porting that resilience to eeschema, plus two small fork fixes to
make `SKIP_UNDO` safe for our use.

## Question

Miss 09's option 1 is "local-ops-only undo": remote applies stop landing on the
receiving editor's undo stack, so Ctrl+Z can never revert a peer's work. Both commit
classes support a `SKIP_UNDO` push flag — but 09 warned that KiCad's undo machinery
assumes the stack mirrors model history, and that `PICKED_ITEMS_LIST` holds raw
pointers which remote applies could strand. How bad is that really?

## What makes it easier than 09 feared

**The flag exists on both sides and skips only what we want (almost — see fix 2).**
`SKIP_UNDO` is honored by both commit classes (`pcbnew/board_commit.h:40`,
`eeschema/sch_commit.h:40`; base signature `include/commit.h:132`). Under it the
commit still does everything remote applies go through a real commit *for*:
board/screen add/remove, `view->Add/Remove/Update`, connectivity dirty-marking and
ratsnest (`board_commit.cpp:463-467,516`), teardrops, listener callbacks
(`OnItemsCompositeUpdate` / `OnSchItems*`), and the model-change events. Only the
undo-picker creation and the final `SaveCopyInUndoList` are gated
(`board_commit.cpp:325,356,455,606`; `sch_commit.cpp:266,295,363,448`).

**Exactly four Push sites to change, each already remote-tagged.** All remote data
funnels through `doApply` / `doApplyItems` per editor
(`wasm/bindings/eeschema_embind.cpp:1093,1218`;
`wasm/bindings/pcbnew_embind.cpp:965,1061`), every one bracketed by the
`s_applyingRemote` guard — the exact local/remote signal, available at the Push call.
Deletes, adopt, and the parked-dirty catch-up all funnel through `doApplyItems`;
there is no fifth production path.

**Change detection is unaffected.** The local-edit→yjs emit path is the
listener-`trigger()` + post-settle `flushDiff`, suppressed during remote applies by
`s_applyingRemote` (`eeschema_embind.cpp:652`, `pcbnew_embind.cpp:871`) — entirely
independent of whether the commit is undoable. Skipping undo disturbs neither the
suppression during applies nor the emit on genuine local edits (including the emit of
a local undo itself, which is what makes undo propagate today).

**Pcbnew undo already survives items vanishing behind its back.** Our fork's
`PutDataInPreviousState` checks every picker against `BOARD::ResolveItem( uuid )` and
drops entries whose items no longer exist (`pcbnew/undo_redo.cpp:428-437`), and even
re-resolves stale `CHANGED` pointers by UUID before swapping the clone image back in
(`:504`, comment cites ExchangeFootprint-style swaps). Group parent/member pointers
are rebuilt from KIIDs cached in the picker itself
(`undo_redo_container.h:114-115`, rebuilt at `undo_redo.cpp:633-658`). So on the PCB
side, a remote apply deleting or replacing an item referenced by a local undo entry
degrades gracefully (entry dropped) instead of crashing.

## The actual work

1. **Port the UUID guard to eeschema — the core task.**
   `eeschema/schematic_undo_redo.cpp::PutDataInPreviousState` (`:246`) has *no*
   existence or re-resolution check: it dereferences the stored raw `EDA_ITEM*`
   directly (`:270,399,431`); only the group-relink post-pass uses
   `Schematic().ResolveItem` (`:485,504`). Since `doApplyItems` upserts full item
   subtrees as remove-by-uuid + re-add, a remote **change** (not just a delete) to an
   item referenced by a local undo entry means a dangling pointer → crash on Ctrl+Z.
   Fix: mirror pcbnew's pattern — existence-check each picker via
   `SCHEMATIC::ResolveItem` (`eeschema/schematic.h:129`), drop missing entries,
   re-resolve `CHANGED` pointers before `SwapItemData`. ~50–100 lines, follows an
   in-tree precedent, plausibly upstreamable. This is the bulk of the effort.

2. **Un-bundle connectivity from `SKIP_UNDO` on the SCH side.** Unlike pcbnew,
   `SCH_COMMIT::pushSchEdit` gates `RecalculateConnections` inside the same
   `if( !( aCommitFlags & SKIP_UNDO ) )` block as `SaveCopyInUndoList`
   (`sch_commit.cpp:448-463`). Remote applies need that recalc — it is the reason
   they go through real commits. Small fork change: split the gate (or run the recalc
   from the binding after Push).

3. **Plug the removed-item leak under `SKIP_UNDO`.** In the REMOVE branch the live
   item is flagged `UR_TRANSIENT` (`board_commit.cpp:447`) but with `SKIP_UNDO` no
   picker takes ownership and the clone is deleted (`:490`), so the removed item
   leaks; same shape on the SCH side (`sch_commit.cpp:409-410`). Existing `SKIP_UNDO`
   callers (DRC-marker flows, `drc_tool.cpp:208` etc.) never remove user items, so
   upstream never hit this. Fix: delete removed items in the commit when the flag is
   set (or in the binding, which knows the removed set).

4. **Silence the "incomplete undo" modal.** When pcbnew drops a stranded entry it
   pops a blocking `wxMessageBox( "Incomplete undo/redo operation: some items not
   found" )` (`pcbnew/undo_redo.cpp:628`). In a collab session that is routine, not
   exceptional — downgrade to a log line (or toast) in the fork, and use the same
   quiet path in the eeschema port.

Plus wasm-side flag changes at the four Push sites (~one line each) and multi-client
e2e coverage for undo-after-remote scenarios (delete-under-undo, change-under-undo,
adopt-while-history-nonempty), which given the two-tab harness is roughly another day.

## Residual semantic gaps (accepted, not blockers)

- **Full-clone restore clobbers concurrent field edits.** Undoing a local move of an
  item restores the whole old item image (`CHANGED` swaps the full clone), so a
  peer's concurrent edit to another property of the same item is reverted too.
  Last-writer-wins collab undo — same as Figma; converges; not an operational rebase.
  Same granularity trade-off as [14](14-opt-item-granularity-bandwidth.md).
- **Duplicate-KIID re-add edge.** Local delete parks the item on the local undo stack
  (owned, `DELETED` pickers skip the existence check — `undo_redo.cpp:423`); if a
  peer re-adds the same uuid and the local user then undoes the delete, the stored
  item is re-added alongside the peer's copy with the same KIID (`:569-572`). Rare;
  the differ keys by uuid so it likely reconciles to one, but needs a test.
- **Pre-existing local entries at adopt time** mostly reference replaced items and
  get dropped by the UUID guard on first undo — acceptable, and strictly better than
  the current adopt undo bomb.

## Effort summary

| Piece | Where | Size |
|---|---|---|
| `SKIP_UNDO` at the 4 remote Push sites | wasm bindings | trivial |
| SCH connectivity/`SKIP_UNDO` split | kicad fork (sch_commit) | small |
| Removed-item leak fix | kicad fork (both commits) | small |
| eeschema UUID guard port | kicad fork (schematic_undo_redo) | 1–2 days, core |
| Modal → quiet drop | kicad fork (undo_redo) | trivial |
| Two-client undo e2e | tests/ | ~1 day |

All fork touches are small and upstream-plausible, consistent with keeping the fork
close to upstream. Miss 09's option 3 (clear undo stack on adopt) becomes largely
moot: with `SKIP_UNDO`, adopt creates no undo entry at all, and stranded pre-adopt
entries are handled by the UUID guard.
