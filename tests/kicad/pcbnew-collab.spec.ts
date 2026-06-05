import { execSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

/**
 * pcbnew Yjs collaborative bridge (features/yjs-bridge commit 4).
 *
 * pcbnew reuses the same wire contract + generic JS reconciler as pl_editor/eeschema; the new
 * code is the C++ adapter — a native BOARD_LISTENER trigger + post-settle snapshot-diff emit,
 * and a BOARD_COMMIT apply run inside a COROUTINE (so a freshly-built item's GAL view->Add has
 * the Asyncify/fiber context it needs, exactly as eeschema). Coverage:
 *   - snapshot (read): kicadCollabSnapshot reflects items by uuid/type/position.
 *   - apply (single page): kicadCollabApply moves/removes/adds tracks by uuid (deferred via
 *     CallAfter + coroutine, so poll for the result).
 *   - two-tab: a real local move propagates A→B over BroadcastChannel (skipped headless — the
 *     harness can't PAINT; verified in the real web app).
 *
 * pcbnew internal units are nanometres (1 mm = 1e6 IU), unlike eeschema (1e4 IU/mm).
 */

const SEG1 = "44444444-0000-0000-0000-000000000001";
const SEG2 = "44444444-0000-0000-0000-000000000002";
// A footprint and two of its TEXT children (a silkscreen Reference field + a user fp_text), each
// with a stable uuid so the test can move them independently of the footprint — the bug 1 case.
const FP1 = "66666666-0000-0000-0000-000000000001";
const FP1_REF = "66666666-0000-0000-0000-0000000000aa"; // Reference field (PCB_FIELD, F.SilkS)
const FP1_TXT = "66666666-0000-0000-0000-0000000000cc"; // user fp_text (PCB_TEXT, F.SilkS)
const SAMPLE_PCB = `(kicad_pcb
\t(version 20241229)
\t(generator "pcbnew")
\t(generator_version "9.0")
\t(general
\t\t(thickness 1.6)
\t)
\t(paper "A4")
\t(layers
\t\t(0 "F.Cu" signal)
\t\t(2 "B.Cu" signal)
\t\t(37 "F.SilkS" user)
\t\t(25 "Edge.Cuts" user)
\t)
\t(setup)
\t(net 0 "")
\t(footprint "TestLib:R"
\t\t(layer "F.Cu")
\t\t(uuid "${FP1}")
\t\t(at 100 100)
\t\t(attr smd)
\t\t(property "Reference" "R1"
\t\t\t(at 0 -4.2 0)
\t\t\t(layer "F.SilkS")
\t\t\t(uuid "${FP1_REF}")
\t\t\t(effects (font (size 1 1) (thickness 0.15)))
\t\t)
\t\t(property "Value" "R"
\t\t\t(at 0 4.6 0)
\t\t\t(layer "F.Fab")
\t\t\t(uuid "66666666-0000-0000-0000-0000000000bb")
\t\t\t(effects (font (size 1 1) (thickness 0.15)))
\t\t)
\t\t(fp_text user "HELLO"
\t\t\t(at 0 0 0)
\t\t\t(layer "F.SilkS")
\t\t\t(uuid "${FP1_TXT}")
\t\t\t(effects (font (size 1 1) (thickness 0.15)))
\t\t)
\t)
\t(segment (start 50.8 50.8) (end 101.6 50.8) (width 0.2) (layer "F.Cu") (net 0) (uuid "${SEG1}"))
\t(segment (start 50.8 76.2) (end 101.6 76.2) (width 0.2) (layer "F.Cu") (net 0) (uuid "${SEG2}"))
)
`;

type FS = { mkdirTree(p: string): void; writeFile(p: string, d: string): void };
type Mod = {
  kicadOpenFile(p: string): unknown;
  kicadCollabSnapshot(): string;
  kicadCollabApply(j: string): unknown;
  kicadCollabTestMoveFirst(dx: number, dy: number): string;
  kicadCollabGetPos(id: string): string;
};

function hasAbort(l: { consoleLogs: string[]; errors: string[] }): boolean {
  return [...l.consoleLogs, ...l.errors].some((s) => s.includes("Aborted("));
}

async function bootAndOpen(page: Page, name: string): Promise<void> {
  // Use the seeded collab harness (pcbnew-collab.html), which skips the first-run setup
  // wizard via a kicad_common.json seed — exactly like eeschema.html. The plain pcbnew.html
  // deliberately keeps the wizard (pcbnew.spec.ts tests it), which would block boot here.
  await page.goto("/kicad/pcbnew-collab.html");
  await expect(page.locator("#canvas")).toBeVisible({ timeout: 90000 });
  await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { Module?: Mod }).Module;
      return (
        typeof m?.kicadOpenFile === "function" &&
        typeof m?.kicadCollabSnapshot === "function" &&
        typeof m?.kicadCollabApply === "function" &&
        typeof m?.kicadCollabTestMoveFirst === "function"
      );
    },
    null,
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () =>
      !!window.wxElementRegistry &&
      window.wxElementRegistry
        .findAll({ visible: true })
        .some((e) => /Frame$/.test(e.typeName) || (e.name || "").endsWith("Frame")),
    null,
    { timeout: 90000 },
  );

  await page.evaluate(
    ({ content, name }) => {
      const w = window as unknown as { FS: FS; Module: Mod };
      const dir = "/home/kicad/documents";
      try {
        w.FS.mkdirTree(dir);
      } catch {
        /* exists */
      }
      const p = `${dir}/${name}.kicad_pcb`;
      w.FS.writeFile(p, content);
      w.Module.kicadOpenFile(p);
    },
    { content: SAMPLE_PCB, name },
  );

  await expect.poll(() => page.title(), { timeout: 30000 }).toMatch(new RegExp(name, "i"));
}

test.beforeAll(() => {
  execSync("node collab/build.mjs", { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });
});

test.describe("pcbnew collab bridge — single page", () => {
  test("snapshot reflects board by uuid/type/position", async ({ page, testLogger }) => {
    await bootAndOpen(page, "snap");
    const snap = await page.evaluate(() => JSON.parse(window.Module.kicadCollabSnapshot()));
    const byId = new Map<string, { type: string; x: number; y: number }>(
      snap.added.map((i: { id: string; type: string; x: number; y: number }) => [i.id, i]),
    );
    expect(byId.has(SEG1)).toBe(true);
    expect(byId.get(SEG1)!.type).toBe("PCB_TRACK");
    expect(byId.get(SEG1)!.x).toBe(50_800_000); // 50.8mm × 1e6 IU (nm)
    // The footprint AND its text children are emitted individually by uuid (bug 1 fix) — that's
    // what lets a silkscreen text move sync without the footprint moving.
    expect(byId.has(FP1), "footprint present").toBe(true);
    expect(byId.get(FP1)!.type).toBe("FOOTPRINT");
    expect(byId.has(FP1_REF), "footprint Reference field present").toBe(true);
    expect(byId.get(FP1_REF)!.type).toBe("PCB_FIELD");
    expect(byId.has(FP1_TXT), "footprint user fp_text present").toBe(true);
    expect(byId.get(FP1_TXT)!.type).toBe("PCB_TEXT");
    expect(hasAbort(testLogger), "no WASM abort").toBe(false);
  });

  // Apply mutates the model headless: kicadOpenFile returns false (the incomplete-project load
  // skips some late steps) but the board IS built, so BOARD_COMMIT::Push takes effect. Rendering
  // still needs the real app. (Same headless reality as the eeschema apply test.)
  const TRACK_ID = "55555555-0000-0000-0000-000000000001";

  test("apply moves/removes/adds tracks by uuid, no echo", async ({ page, testLogger }) => {
    await bootAndOpen(page, "apply");

    const before = await page.evaluate((id) => window.Module.kicadCollabGetPos(id), SEG1);
    const [bx, by] = before.split(",").map(Number);
    const nx = bx + 5_000_000; // +5mm

    await page.evaluate(() => {
      (window as unknown as { __echo: string[] }).__echo = [];
      (window as unknown as { kicadCollab: { onDelta: (j: string) => void } }).kicadCollab = {
        onDelta: (j: string) => (window as unknown as { __echo: string[] }).__echo.push(j),
      };
    });

    // changed: reshape SEG1's endpoints (a track moves via its two endpoints, like an eeschema
    // wire — the sx/sy/ex/ey form the emit side always produces). Deferred via CallAfter → poll.
    await page.evaluate(
      ({ id, nx, by }) =>
        window.Module.kicadCollabApply(
          JSON.stringify({
            changed: [{ id, type: "PCB_TRACK", sx: nx, sy: by, ex: nx + 50_800_000, ey: by, width: 200000 }],
            added: [],
            removed: [],
          }),
        ),
      { id: SEG1, nx, by },
    );
    await expect
      .poll(() => page.evaluate((id) => window.Module.kicadCollabGetPos(id), SEG1), {
        timeout: 10000,
        intervals: [200],
      })
      .toBe(`${nx},${by}`);

    // removed: delete SEG2.
    await page.evaluate(
      (seg) =>
        window.Module.kicadCollabApply(JSON.stringify({ changed: [], added: [], removed: [seg] })),
      SEG2,
    );
    await expect
      .poll(() => page.evaluate((id) => window.Module.kicadCollabGetPos(id), SEG2), {
        timeout: 10000,
        intervals: [200],
      })
      .toBe("");

    // added: a new track reconstructs by uuid (native PCB_TRACK build — no clipboard Parse).
    await page.evaluate(
      (trackId) =>
        window.Module.kicadCollabApply(
          JSON.stringify({
            changed: [],
            removed: [],
            added: [
              {
                id: trackId,
                type: "PCB_TRACK",
                sx: 60_000_000,
                sy: 60_000_000,
                ex: 90_000_000,
                ey: 60_000_000,
                width: 200000,
                layer: 0, // F_Cu
              },
            ],
          }),
        ),
      TRACK_ID,
    );
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.Module.kicadCollabSnapshot())).includes(TRACK_ID),
        { timeout: 10000, intervals: [250] },
      )
      .toBe(true);

    const echoes = await page.evaluate(() => (window as unknown as { __echo: string[] }).__echo);
    expect(echoes, "apply() must not echo a local onDelta").toHaveLength(0);
    expect(hasAbort(testLogger), "no WASM abort").toBe(false);
  });

  // Bug 1: a footprint's silkscreen text (a child item) can be moved independently of its
  // footprint. apply resolves the child by uuid (BOARD::ResolveItem sees footprint children) and
  // commits a Modify — which BOARD_COMMIT::undoLevelItem rolls up to the parent footprint — then
  // SetPosition. The footprint itself does NOT move. Covers both the Reference field (PCB_FIELD)
  // and a user fp_text (PCB_TEXT).
  test("apply moves a footprint's silkscreen text child by uuid (footprint stays put)", async ({
    page,
    testLogger,
  }) => {
    await bootAndOpen(page, "fptext");

    const fpBefore = await page.evaluate((id) => window.Module.kicadCollabGetPos(id), FP1);

    for (const childId of [FP1_REF, FP1_TXT]) {
      const before = await page.evaluate((id) => window.Module.kicadCollabGetPos(id), childId);
      expect(before, `child ${childId} resolvable`).not.toBe("");
      const [cx, cy] = before.split(",").map(Number);
      const ny = cy + 3_000_000; // +3mm in Y

      await page.evaluate(
        ({ id, cx, ny }) =>
          window.Module.kicadCollabApply(
            JSON.stringify({ changed: [{ id, x: cx, y: ny }], added: [], removed: [] }),
          ),
        { id: childId, cx, ny },
      );
      await expect
        .poll(() => page.evaluate((id) => window.Module.kicadCollabGetPos(id), childId), {
          timeout: 10000,
          intervals: [200],
        })
        .toBe(`${cx},${ny}`);
    }

    // The footprint origin must be unchanged — only the child text moved.
    const fpAfter = await page.evaluate((id) => window.Module.kicadCollabGetPos(id), FP1);
    expect(fpAfter, "footprint did not move").toBe(fpBefore);
    expect(hasAbort(testLogger), "no WASM abort").toBe(false);
  });
});

test.describe("pcbnew collab bridge — two tabs (BroadcastChannel)", () => {
  // SKIP headless for the same reason as the single-page apply test (harness can't PAINT).
  // Verified working in the real web app.
  test.skip("a local move propagates A→B", async ({ context, testLogger }) => {
    const channel = `pcb-collab-e2e-${test.info().workerIndex}`;
    const bundle = path.resolve(__dirname, "../apps/kicad/collab-bundle.js");

    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await bootAndOpen(tabA, "tabA");
    await bootAndOpen(tabB, "tabB");
    for (const p of [tabA, tabB]) await p.addScriptTag({ path: bundle });

    const startCollab = (p: Page) =>
      p.evaluate(async (ch) => {
        const w = window as unknown as {
          KicadCollab: { start: (m: unknown, win: unknown, o: unknown) => Promise<unknown> };
          Module: unknown;
        };
        await w.KicadCollab.start(w.Module, window, { channel: ch, settleMs: 500 });
      }, channel);
    await startCollab(tabA);
    await startCollab(tabB);

    const uuid = await tabA.evaluate(() => window.Module.kicadCollabTestMoveFirst(2_000_000, 0));
    expect(uuid).toMatch(/[0-9a-f-]{36}/);
    const orig = await tabA.evaluate((id) => window.Module.kicadCollabGetPos(id), uuid);

    await expect
      .poll(() => tabA.evaluate((id) => window.Module.kicadCollabGetPos(id), uuid), {
        timeout: 15000,
        intervals: [300],
      })
      .not.toBe(orig);
    const posA = await tabA.evaluate((id) => window.Module.kicadCollabGetPos(id), uuid);

    await expect
      .poll(() => tabB.evaluate((id) => window.Module.kicadCollabGetPos(id), uuid), {
        timeout: 15000,
        intervals: [300],
      })
      .toBe(posA);

    expect(hasAbort(testLogger), "no WASM abort").toBe(false);
    await tabA.close();
    await tabB.close();
  });
});
