import { test, expect, type Page } from '@playwright/test';
import { waitForRegistry, clickByTooltip } from '../e2e/utils/element-tracker';

// Mirrors @pcbjam/shared OWNER_HEADER (tests/ doesn't depend on the shared pkg).
const OWNER_HEADER = 'x-pcbjam-owner';

/**
 * 0004-D: the FULL remote write round-trip — no in-memory spike. Boot ensures a
 * "My Symbols" user lib via the backend's createLib; New Symbol → Ctrl+S routes
 * the save through window.kicadLibs.request("save") → remoteLibsSource.saveItemBody
 * → PUT /api/libs/:lib/items/... on the example backend. Verify the backend
 * persisted a valid fork-native body, then reload and confirm it enumerates.
 *
 * Requires the example backend (:3060) running with USER_LIBS_DIR set.
 */

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3060';
const SHOT = (n: string) => `test-results/symremote-${n}.png`;

async function focusCanvas(page: Page): Promise<void> {
  const box = await page.locator('#canvas').boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

test('symbol editor save persists to the backend (remote write round-trip)', async ({ page }) => {
  // Unique owner per run so the test is isolated from prior runs.
  const owner = `e2e-${Date.now()}`;
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto(`/p/demo/symbol_editor/?libowner=${owner}`);
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 150000 });
  await waitForRegistry(page, 150000);
  await page.waitForFunction(
    () => !!window.wxElementRegistry && window.wxElementRegistry.findAll({}).length > 5,
    null,
    { timeout: 150000 },
  );
  await page.waitForFunction(() => !!(window as any).kicadLibs, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: SHOT('01-boot'), scale: 'css' });

  // Boot's ensure-user-lib created "My Symbols" (slug my-symbols) for this owner.
  const ownerHeaders = { [OWNER_HEADER]: owner };
  const libsRes = await fetch(`${BACKEND}/api/libs`, { headers: ownerHeaders });
  const libsBody = (await libsRes.json()) as { id: string; type: string }[];
  expect(libsBody.some((l) => l.type === 'user' && l.id === 'my-symbols'), 'user lib created at boot').toBe(true);

  // Select the (only) library row in the tree, then New Symbol.
  const hdr = await page.evaluate(() => {
    const rd = window.wxElementRegistry.findAllRendered({});
    const h = rd.find((e: any) => e.elementType === 'columnheader' && e.label === 'Item');
    return h ? { cx: h.centerX, cy: h.centerY, hgt: h.height } : null;
  });
  expect(hdr, 'Item column header found').not.toBeNull();
  await page.mouse.click(hdr!.cx, hdr!.cy + hdr!.hgt + 8);
  await page.waitForTimeout(200);
  await page.keyboard.press('Home');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);

  expect(await clickByTooltip(page, 'New Symbol...'), 'New Symbol clicked').toBe(true);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('02-newsym'), scale: 'css' });

  // Name field (the one that isn't the lib filter ~y65/87), then confirm.
  const nameField = await page.evaluate(() => {
    const all = window.wxElementRegistry.findAll({ visible: true });
    const t = all
      .filter((e: any) => /TextCtrl/i.test(e.typeName))
      .map((e: any) => ({ cx: Math.round(e.centerX), cy: Math.round(e.centerY) }))
      .find((e: any) => Math.abs(e.cy - 65) > 30 && Math.abs(e.cy - 87) > 30);
    return t ?? null;
  });
  expect(nameField, 'New Symbol name field present').toBeTruthy();
  await page.mouse.click(nameField!.cx, nameField!.cy);
  await page.waitForTimeout(150);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('RemoteRes', { delay: 40 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('03-created'), scale: 'css' });

  // Save → PUT to the backend.
  await focusCanvas(page);
  await page.keyboard.press('Control+s');

  // Poll the backend until the item lands.
  let items: { kind: string; name: string }[] = [];
  await expect
    .poll(
      async () => {
        const r = await fetch(`${BACKEND}/api/libs/my-symbols/items`, { headers: ownerHeaders });
        items = r.ok ? ((await r.json()) as { kind: string; name: string }[]) : [];
        return items.length;
      },
      { timeout: 30000, intervals: [500] },
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: SHOT('04-saved'), scale: 'css' });

  const saved = items[0];
  logs.push(`[spec] backend item: ${JSON.stringify(saved)}`);

  // The persisted body is a well-formed fork-native kicad_symbol_lib.
  const bodyRes = await fetch(
    `${BACKEND}/api/libs/my-symbols/items/symbol/${encodeURIComponent(saved.name)}`,
    { headers: ownerHeaders },
  );
  const body = await bodyRes.text();
  logs.push(`[spec] persisted body (${body.length} bytes):\n${body}`);
  expect(body).toContain('(kicad_symbol_lib');
  expect(body).toContain('(version 20250925)');
  expect(body).toContain(`(symbol "${saved.name}"`);

  // App stayed live.
  expect(logs.some((l) => l.includes('Aborted(')), 'no WASM abort').toBe(false);
  expect(new URL(page.url()).searchParams.get('oomRetry'), 'no OOM respawn').toBeNull();

  console.log('--- spec log ---\n' + logs.join('\n'));
});
