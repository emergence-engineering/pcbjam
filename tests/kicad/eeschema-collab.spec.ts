import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

/**
 * eeschema Yjs collaborative bridge (features/yjs-bridge commit 3) — READ side.
 *
 * eeschema reuses the same wire contract + generic JS reconciler as pl_editor; the new
 * code is the C++ adapter (native SCHEMATIC_LISTENER emit + SCH_COMMIT apply). The
 * read/emit half works (verified in the real web app: a real edit fires the listener and
 * broadcasts a delta). This spec covers what is reproducible headlessly: kicadCollabSnapshot
 * reflecting the schematic by uuid/type/position.
 *
 * APPLY is a known open follow-up (0003): editor write ops — specifically
 * SCH_ITEM::Move — trap with "indirect call signature mismatch" when invoked outside a
 * KiCad tool coroutine (Asyncify+fiber interaction). The apply/two-tab tests are skipped
 * until apply is routed through the tool framework. See
 * memory/eeschema-collab-asyncify-apply.
 */

const WIRE1 = "22222222-0000-0000-0000-000000000001";
const WIRE2 = "22222222-0000-0000-0000-000000000002";
const SAMPLE_SCH = `(kicad_sch
\t(version 20250114)
\t(generator "eeschema")
\t(generator_version "9.0")
\t(uuid "11111111-1111-1111-1111-111111111111")
\t(paper "A4")
\t(lib_symbols)
\t(wire (pts (xy 50.8 50.8) (xy 101.6 50.8)) (stroke (width 0) (type default)) (uuid "${WIRE1}"))
\t(wire (pts (xy 50.8 76.2) (xy 101.6 76.2)) (stroke (width 0) (type default)) (uuid "${WIRE2}"))
\t(sheet_instances (path "/" (page "1")))
)
`;

type FS = { mkdirTree(p: string): void; writeFile(p: string, d: string): void };
type Mod = {
  kicadOpenFile(p: string): unknown;
  kicadCollabSnapshot(): string;
  kicadCollabGetPos(id: string): string;
};

function hasAbort(l: { consoleLogs: string[]; errors: string[] }): boolean {
  return [...l.consoleLogs, ...l.errors].some((s) => s.includes("Aborted("));
}

async function bootAndOpen(page: Page, name: string): Promise<void> {
  await page.goto("/kicad/eeschema.html");
  await expect(page.locator("#canvas")).toBeVisible({ timeout: 90000 });
  await page.waitForFunction(() => !!window.wxElementRegistry, null, { timeout: 90000 });
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { Module?: Mod }).Module;
      return (
        typeof m?.kicadOpenFile === "function" &&
        typeof m?.kicadCollabSnapshot === "function"
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
      const p = `${dir}/${name}.kicad_sch`;
      w.FS.writeFile(p, content);
      w.Module.kicadOpenFile(p);
    },
    { content: SAMPLE_SCH, name },
  );

  await expect.poll(() => page.title(), { timeout: 30000 }).toMatch(new RegExp(name, "i"));
}

test.describe("eeschema collab bridge — snapshot (read side)", () => {
  test("kicadCollabSnapshot reflects schematic items by uuid/type/position", async ({
    page,
    testLogger,
  }) => {
    await bootAndOpen(page, "single");

    const snap = await page.evaluate(() => JSON.parse(window.Module.kicadCollabSnapshot()));
    const byId = new Map<string, { type: string; x: number; y: number }>(
      snap.added.map((i: { id: string; type: string; x: number; y: number }) => [i.id, i]),
    );

    expect(byId.has(WIRE1)).toBe(true);
    expect(byId.has(WIRE2)).toBe(true);
    expect(byId.get(WIRE1)!.type).toBe("SCH_LINE");
    // 50.8 mm in eeschema internal units (×10000) = 508000.
    expect(byId.get(WIRE1)!.x).toBe(508000);
    expect(byId.get(WIRE1)!.y).toBe(508000);

    // getPos resolves the same item by uuid.
    const pos = await page.evaluate((id) => window.Module.kicadCollabGetPos(id), WIRE1);
    expect(pos).toBe("508000,508000");

    expect(hasAbort(testLogger), "no WASM abort").toBe(false);
  });

  // BLOCKED (0003 follow-up): apply traps on SCH_ITEM::Move outside a tool coroutine.
  // Re-enable once apply is routed through the TOOL_MANAGER. The read/emit side is proven
  // working in the real web app; only programmatic apply is affected.
  test.skip("apply moves an item by uuid (blocked: SCH_ITEM::Move coroutine trap)", () => {});
  test.skip("two-tab move propagates A→B (blocked: same apply trap)", () => {});
});
