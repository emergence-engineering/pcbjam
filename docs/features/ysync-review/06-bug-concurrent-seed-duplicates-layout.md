# Bug 06 — Concurrent first-seed duplicates `kdoc_layout`; corrupt materialization with no self-heal

**Severity:** medium (race window is small but the damage is durable file corruption)
**Status:** FIXED 2026-07-03 — see [17](17-fixes-bugs-01-07.md) (batch 4: arbitrated seedDocToY, fix direction 2)

## Where

- `web/pcbjam-shared/src/kicad-y.ts:79-94` — `docToY`: `layout.delete(0, length)` then
  `layout.insert(0, doc.layout)` inside one transaction
- Seed decision points: `web/standalone/src/wasm/collab/kicad-binding.ts:127-175`
  (`seed()` checks `ydocHasState` then seeds), `provider.ts:56-68` (BroadcastChannel
  `settleMs`, default 300 ms), `index.ts:85-98` (`whenSynced()` → `seed()`)

## The race

Seed-vs-adopt is decided by a **check-then-act** on the client: after `whenSynced()`,
if `ydocHasState(doc)` is false, the client seeds. Two clients opening the same fresh
room concurrently can both observe "empty" before receiving each other's seed
transaction:

- network providers (partykit / hocuspocus): window ≈ one server round-trip between
  sync-complete and the peer's update arriving;
- BroadcastChannel: window ≈ the whole `settleMs` (300 ms) if both tabs open together.

Two simultaneous `docToY` calls then merge as follows:

- `kdoc_meta.root` — Y.Map LWW → converges fine.
- `kdoc_items` — same uuid keys, (typically) identical values → LWW per key →
  converges fine.
- **`kdoc_layout` — breaks.** Each client's `delete` sees only its own (empty) view;
  each `insert` is an independent CRDT op, and Y.Array keeps **both** sequences. The
  merged layout holds two `(version …)`, two `(paper …)`, two `(lib_symbols …)`, and
  **two `{item: uuid}` slots per root item**.

## Consequences

- `docToFile` renders every root item **twice** (each `{item}` slot resolves; the
  per-render `seen` set only guards cycles within one path, not repeated slots) and
  duplicates the preamble forms → the materialized file is invalid or at best
  semantically doubled.
- ydoc-mode opens materialize this corruption directly.
- **Nothing heals it**: `ydocHasState` is now true, so no client ever re-seeds;
  `applyDeltaToY` only appends/removes individual root slots, it never rewrites the
  layout. The duplication is permanent for the room's lifetime.
- If the two seeders had *different* file versions (one stale), items also interleave
  arbitrarily per-key — messier still, but the layout duplication alone is enough to
  corrupt.

## Fix directions (pick one)

1. **Server-side seeding (cleanest):** the sync server creates/initializes the room
   document from the stored file exactly once (it already owns the `.ydoc` blob);
   clients never file-seed. Kills the race by construction, and also removes the
   client's seed-authority special cases.
2. **Client-side seed arbitration:** write a random `seedNonce` into `kdoc_meta` inside
   the same `docToY` transaction. After the transaction has round-tripped (next sync /
   short settle), re-read the nonce: LWW means exactly one seeder "won". A loser that
   sees a foreign nonce re-runs `docToY`? No — re-running re-inserts. The loser must
   instead **retract its own layout inserts** (delete slots whose insertion client-id
   is its own) or simply rewrite layout in a fresh transaction *after* observing the
   winner's state (delete-all + insert is safe once only one client does it, so gate
   the rewrite on "my nonce lost").
3. **Read-side dedup (mitigation, not a fix):** `yToDoc` / `docToFile` could drop
   duplicate `{item}` slots and duplicate preamble heads. This masks the corruption for
   materialization but leaves the doc itself dirty; only worth doing as a safety net on
   top of 1 or 2.

Option 1 is recommended — it also solves stale-file double-seeding and removes the
`settleMs` heuristic from the BroadcastChannel path.

## Verification

Unit: two Y.Docs, `docToY` the same `KicadDoc` into both, sync updates both ways,
assert `docToFile` output equals the single-seed output (currently it doesn't — layout
doubles). Integration: open the same fresh project in two tabs simultaneously
(Promise.all in the harness) and assert the room materializes cleanly.

Repro (2026-07-03): unit in `web/pcbjam-shared/test/ysync-repros.test.ts` (doubled
`{item}` slot + materialization ≠ single-seed, plus a green CRDT-determinism baseline
— both docs corrupt IDENTICALLY, which is why nothing downstream notices); e2e race
in `tests/kicad/ysync-two-tab.spec.ts` (Promise.all start, equal settleMs,
skip-guarded when the race happens not to fire — it fired on every observed run).
See [16](16-repro-suite-results-and-empirical-findings.md).
