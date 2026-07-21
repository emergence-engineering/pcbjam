import { execSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "./fixtures";
import {
  TRIO_PL,
  TRIO_PCB,
  TRIO_SCH,
  type ToolCfg,
  SYM1,
  WIRE2,
  FP1,
  PAD1,
  VIA1,
  SEG1,
  callHook,
  closeTrio,
  drift,
  getPos,
  hasAbort,
  modelText,
  openTrio,
  oracleSweep,
  settleConverged,
  undoDepth,
} from "./utils/trio";

/**
 * Drift trio harness — S1 baseline (standalone-hardening 0008, phase A).
 *
 * Three tabs as three users in one room: A seeds + edits, B edits, C only
 * observes. After every action group the full oracle sweep runs: per-tab drift
 * silence (editor ≡ Y.Doc, production comparator), byte-identical silent saves
 * across all three, and identical room materialization. C is the pure
 * remote-apply oracle — everything it holds arrived over the wire.
 *
 * S1 drives only the EXISTING embind test hooks (move/rotate/set-field/
 * set-pad-size/remove); the action-catalog hooks land in phase B.
 *
 * Repro convention (ysync-review): known-open gaps assert the CORRECT behavior
 * and are marked test.fail() naming the tracking doc — fixing the bug flips
 * them to "unexpected pass", forcing the marker's removal.
 */

test.beforeAll(() => {
  // Rebuild the v2 bundle so the harness always exercises the current stack.
  execSync("node collab/build.mjs", { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
});

/** Heavy editors exceed Firefox's per-content-process wasm budget at 2+
 *  instances (see ysync-two-tab.spec.ts) — at 3 it is strictly worse. */
function skipFirefox(): void {
  test.skip(
    test.info().project.name.includes("firefox"),
    "three heavy wasm tabs exceed Firefox's per-process wasm budget",
  );
}

// ── pl_editor: green baseline validating the trio plumbing itself ────────────

test.describe("drift trio — pl_editor (plumbing baseline)", () => {
  test.describe.configure({ timeout: 420000 });

  test("A and B add text, C observes: all three drift-silent and converged", async ({
    context,
    testLogger,
  }) => {
    const room = `drift-trio-pl-${test.info().workerIndex}`;
    const trio = await openTrio(context, TRIO_PL, room);

    const uuidA = await callHook<string>(trio.A, "kicadCollabTestAddText", "From A", 40, 40);
    expect(uuidA).toMatch(/[0-9a-f-]{36}/);
    await expect
      .poll(async () => await modelText(trio.C, TRIO_PL), { timeout: 20000, intervals: [300] })
      .toContain("From A");
    await settleConverged(trio, TRIO_PL);
    await oracleSweep(trio, TRIO_PL);

    const uuidB = await callHook<string>(trio.B, "kicadCollabTestAddText", "From B", 60, 60);
    expect(uuidB).toMatch(/[0-9a-f-]{36}/);
    await expect
      .poll(async () => await modelText(trio.A, TRIO_PL), { timeout: 20000, intervals: [300] })
      .toContain("From B");
    await settleConverged(trio, TRIO_PL);
    await oracleSweep(trio, TRIO_PL);

    expect(hasAbort(testLogger), "no WASM abort").toBe(false);
    await closeTrio(trio);
  });
});

// ── The heavy editors: eeschema + pcbnew S1 ──────────────────────────────────

interface S1Actions {
  /** [hookName, ...args] for B's rotate target and A's property edit. */
  rotateTarget: string;
  propertyEdit: { fn: string; args: (string | number)[]; expectInSave: string };
  removeTarget: string;
  moveDx: number;
}

const S1: ReadonlyArray<readonly [ToolCfg, string, S1Actions]> = [
  [
    TRIO_SCH,
    "eeschema",
    {
      rotateTarget: SYM1,
      // Assign-footprint-shaped edit: symbol field text (Value).
      propertyEdit: {
        fn: "kicadCollabTestSetFieldText",
        args: [SYM1, "trio-10k"],
        expectInSave: '"trio-10k"',
      },
      removeTarget: WIRE2,
      moveDx: 40000, // eeschema IU = 1e4/mm → 4mm
    },
  ],
  [
    TRIO_PCB,
    "pcbnew",
    {
      rotateTarget: FP1,
      propertyEdit: {
        fn: "kicadCollabTestSetPadSize",
        args: [PAD1, 1500000, 1000000], // pcbnew IU = 1e6/mm → 1.5 × 1 mm
        expectInSave: "(size 1.5 1)",
      },
      removeTarget: VIA1,
      moveDx: 2000000, // 2mm
    },
  ],
];

for (const [cfg, label, act] of S1) {
  test.describe(`drift trio — ${label} S1 baseline`, () => {
    test.describe.configure({ timeout: 900000 });

    test(`${label}: A+B interleave move/rotate/property/delete, C observes`, async ({
      context,
      testLogger,
    }) => {
      skipFirefox();
      const room = `drift-trio-${label}-${test.info().workerIndex}`;
      const trio = await openTrio(context, cfg, room);

      // 1. A moves the first item (the seeder's emit half — bug 01 regression
      //    surface: seed()'s snapshotItems registered A's listener). The hooks
      //    run on a fiber, so first poll A's OWN pos until the move landed
      //    (two-tab's green precondition), then compare the peers against it.
      const uuids = [...cfg.fixture.matchAll(/\(uuid "([0-9a-f-]{36})"\)/g)].map((m) => m[1]!);
      const before: Record<string, string> = {};
      for (const u of uuids) before[u] = await getPos(trio.A, u);
      const movedId = await callHook<string>(trio.A, "kicadCollabTestMoveFirst", act.moveDx, 0);
      expect(movedId).toMatch(/[0-9a-f-]{36}/);
      await expect
        .poll(() => getPos(trio.A, movedId), { timeout: 15000, intervals: [300] })
        .not.toBe(before[movedId]);
      const posA = await getPos(trio.A, movedId);
      for (const peer of [trio.B, trio.C]) {
        await expect
          .poll(() => getPos(peer, movedId), { timeout: 20000, intervals: [300] })
          .toBe(posA);
      }
      await settleConverged(trio, cfg);
      await oracleSweep(trio, cfg);

      // 2. B rotates the symbol/footprint (joiner's emit half).
      expect(await callHook<boolean>(trio.B, "kicadCollabTestRotateItem", act.rotateTarget, 90)).toBe(
        true,
      );
      await settleConverged(trio, cfg);
      await oracleSweep(trio, cfg);

      // 3. A edits a property (field text / pad size — the "assign footprint,
      //    change value" family).
      expect(
        await callHook<boolean>(trio.A, act.propertyEdit.fn, ...act.propertyEdit.args),
      ).toBe(true);
      for (const peer of [trio.B, trio.C]) {
        await expect
          .poll(async () => await modelText(peer, cfg), { timeout: 20000, intervals: [300] })
          .toContain(act.propertyEdit.expectInSave);
      }
      await settleConverged(trio, cfg);
      await oracleSweep(trio, cfg);

      // 4. B deletes a top-level item.
      expect(await callHook<boolean>(trio.B, "kicadCollabTestRemoveItem", act.removeTarget)).toBe(
        true,
      );
      for (const peer of [trio.A, trio.C]) {
        await expect
          .poll(async () => await modelText(peer, cfg), { timeout: 20000, intervals: [300] })
          .not.toContain(act.removeTarget);
      }
      await settleConverged(trio, cfg);
      await oracleSweep(trio, cfg);

      // 5. Undo isolation: remote applies ride SKIP_UNDO — the observer's undo
      //    stack must still be empty; the editors accumulated only their own ops.
      expect(await undoDepth(trio.C), "observer undo stack").toBe(0);
      expect(await undoDepth(trio.A), "A undo stack").toBeGreaterThan(0);
      expect(await undoDepth(trio.B), "B undo stack").toBeGreaterThan(0);

      expect(hasAbort(testLogger), "no WASM abort").toBe(false);
      await closeTrio(trio);
    });
  });
}

// ── pcbnew segment CHANGE apply (the envelope-parse path) ────────────────────
// A changed track rides wrapInBoardEnvelope → the `(kicad_pcb …)` envelope
// parse on the receiver. ysync 0008 "known limit 1" recorded that path as
// dying silently in the commit — this trio run shows the CHANGE path works
// under the current build (the still-fixme'd roundtrip full-board case is the
// bulk-ADD rebuild, a different path). Kept green as the regression guard.

test.describe("drift trio — pcbnew segment edit (envelope-parse change path)", () => {
  test.describe.configure({ timeout: 900000 });

  test("a segment endpoint edit reaches the peers' editors", async ({
    context,
    testLogger,
  }) => {
    skipFirefox();

    const room = `drift-trio-pcbseg-${test.info().workerIndex}`;
    const trio = await openTrio(context, TRIO_PCB, room);

    expect(await callHook<boolean>(trio.A, "kicadCollabTestMoveEndpoint", SEG1, 2000000, 0)).toBe(
      true,
    );

    // B applies the changed segment blob (envelope parse) and stays
    // drift-silent; all three converge on the moved endpoint.
    await expect
      .poll(async () => (await drift(trio.B, TRIO_PCB))?.updated ?? [], {
        timeout: 20000,
        intervals: [400],
      })
      .toEqual([]);
    await settleConverged(trio, TRIO_PCB);
    await oracleSweep(trio, TRIO_PCB);

    expect(hasAbort(testLogger), "no WASM abort").toBe(false);
    await closeTrio(trio);
  });
});
