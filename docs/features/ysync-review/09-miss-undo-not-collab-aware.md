# Design miss 09 — Undo is not collab-aware: Ctrl+Z reverts peers' work and re-broadcasts it

**Severity:** design gap (converges, but with surprising and destructive UX)
**Status:** open decision

## Where

- `wasm/bindings/eeschema_embind.cpp:722-724` / `:843-845` and
  `wasm/bindings/pcbnew_embind.cpp:806-809` / `:886-888` — remote applies go through
  `SCH_COMMIT` / `BOARD_COMMIT` with `Push( "Collaborative edit" )`, i.e. they create
  ordinary **undoable** entries on the receiving editor's stack
- `web/standalone/src/wasm/collab/kicad-binding.ts:176-188` — the adopt path applies
  ALL doc roots as **one** wire batch → one giant commit
- `web/standalone/src/wasm/collab/sheet-manager.ts:188-191` — parked-dirty rebind runs
  that adopt on every sheet revisit that saw remote traffic

## What happens

Going through a real commit is the right call for model consistency (connectivity,
ratsnest, ERC recompute like a UI edit) — but it has an unhandled consequence:

1. **Ctrl+Z reverts remote work.** A remote apply is on the local undo stack. The user
   pressing undo after a peer's edit reverts *the peer's* change; the reversion is a
   normal local commit → it flushes → it propagates to everyone, including the
   original author. From the author's perspective their edit "randomly disappears".
2. **Adopt commits are undo bombs.** The seed/adopt and the parked-dirty sheet rebind
   apply the *entire sheet* as one commit ("Collaborative edit (items)"). One Ctrl+Z
   after revisiting a sheet reverts the whole remote catch-up — potentially dozens of
   peers' edits — and broadcasts the stale sheet state to the room.
3. Convergence is preserved (the system happily syncs the reverted state), which is
   exactly the problem: the damage replicates perfectly.

There is no loop risk (the reversion is applied on peers as a remote change and
suppressed from re-emit), and redo behaves symmetrically. This is purely a
policy/UX gap, not an algorithmic one — but it can destroy significant work with one
keystroke, so it deserves an explicit decision rather than the current default.

## Options

1. **Exclude remote applies from the undo stack.** Both commit classes support
   pushing without undo (or the undo entry can be dropped after Push). Standard
   collaborative-editor semantics: undo is local-ops-only. This is the direction
   most products (Figma, Google Docs) take. Cost: KiCad's undo machinery assumes the
   stack mirrors model history; entries referencing items later replaced by remote
   applies must be invalidated or made resilient (item-by-uuid re-resolution at undo
   time — KiCad's PICKED_ITEMS_LIST holds pointers, so this needs care).
2. **Keep remote applies undoable but split adopt into per-item diffs** (see
   [13-opt-parked-dirty-full-sheet-replace.md](13-opt-parked-dirty-full-sheet-replace.md))
   so at least the bomb shrinks to the real delta. Doesn't fix (1), halves the blast
   radius.
3. **Minimum bar:** name the undo entries distinctly (already done) and clear the undo
   stack on adopt (a full-sheet replace is a reasonable "history barrier"). Cheap,
   removes the worst case, keeps normal-sized remote entries undoable.

Recommendation: 3 now (one call at adopt time), 1 as the eventual model, evaluated
against how invasive pointer-invalidation is in `PICKED_ITEMS_LIST`.
