import { test, expect, type Page } from '@playwright/test';
import { waitForRegistry, clickByTooltip } from '../e2e/utils/element-tracker';

/**
 * 0009-S footprint write-path spike: does the FOOTPRINT editor boot+render in
 * WASM (with a working Prj()), and does its FootprintSave path route through the
 * pcbjam write bridge, on the MAIN thread, without wedging?
 *
 * Mirrors the proven 0004-A symbol spike, one domain over. Boots the
 * project-scoped footprint_editor with `?fpwrite=1` (an in-memory writable
 * "My Footprints (spike)" lib via the new PCB_IO_PCBJAM_FP plugin + the 4th
 * `kind` bridge arg), creates a new footprint in it, and saves. The plugin's
 * FootprintSave serializes a fork-native (footprint …) s-expr and calls
 * window.kicadLibs.request("save", …, "footprint") on the main thread
 * (EM_ASYNC_JS), captured onto window.__pcbjamSaved. Assert: the body is
 * well-formed fork-native s-expr (version 20251028), and the app stays live
 * (no abort / no OOM respawn) — i.e. the editor-as-tool + main-thread Asyncify
 * save both work. THIS IS THE GATE before the backend (0009-A) is built.
 */

const SHOT = (name: string) => `test-results/fpwrite-${name}.png`;

async function bootFootprintEditor(page: Page): Promise<void> {
  await page.goto('/p/demo/footprint_editor/?fpwrite=1');
  // GATE part 1: the footprint editor frame renders in WASM (canvas + GL).
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 180000 });
  await waitForRegistry(page, 180000);
  await page.waitForFunction(
    () => !!window.wxElementRegistry && window.wxElementRegistry.findAll({}).length > 5,
    null,
    { timeout: 180000 },
  );
  await page.waitForFunction(() => !!(window as any).kicadLibs, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
}

async function focusCanvas(page: Page): Promise<void> {
  const box = await page.locator('#canvas').boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
}

test('footprint editor save routes through the pcbjam_fp write bridge (main thread)', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await bootFootprintEditor(page);
  await page.screenshot({ path: SHOT('01-boot'), scale: 'css' });

  // Spike provider is active.
  expect(await page.evaluate(() => !!(window as any).__pcbjamSaved), 'spike marker present').toBe(true);

  // Select the writable lib in the tree so New Footprint targets it. Same LIB_TREE
  // widget as the symbol editor: the dataviewitem's registry y sits on the column
  // header, so anchor off the "Item" column header and click one row below it.
  const hdr = await page.evaluate(() => {
    const rd = window.wxElementRegistry.findAllRendered({});
    const h = rd.find((e: any) => e.elementType === 'columnheader' && e.label === 'Item');
    return h ? { cx: h.centerX, cy: h.centerY, hgt: h.height } : null;
  });
  if (hdr) {
    await page.mouse.click(hdr.cx, hdr.cy + hdr.hgt + 8); // focus the tree
    await page.waitForTimeout(200);
    await page.keyboard.press('Home');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
  } else {
    logs.push('[spec] WARN: Item column header not found (tree may differ); proceeding');
  }
  await page.screenshot({ path: SHOT('02-lib-selected'), scale: 'css' });

  // New Footprint via the toolbar button. The fork action's FriendlyName is
  // "New Footprint" (PCB_ACTIONS::newFootprint); the "..." variant is a fallback.
  let clicked = await clickByTooltip(page, 'New Footprint');
  if (!clicked) clicked = await clickByTooltip(page, 'New Footprint...');
  if (!clicked) {
    // Diagnostics: dump available tooltips so we can fix the label if needed.
    const tips = await page.evaluate(() =>
      window.wxElementRegistry
        .findAll({})
        .map((e: any) => e.tooltip)
        .filter((t: string) => !!t),
    );
    logs.push(`[spec] New Footprint tooltip not found; tooltips: ${JSON.stringify(tips)}`);
  }
  expect(clicked, 'New Footprint toolbar button clicked').toBe(true);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('03-newfp-dialog'), scale: 'css' });

  // Diagnostics: what dialog/controls are present now.
  const dlg = await page.evaluate(() => {
    const all = window.wxElementRegistry.findAll({ visible: true });
    const pick = (re: RegExp) => all.filter((e: any) => re.test(e.typeName))
      .map((e: any) => ({ type: e.typeName, name: e.name, label: e.label, cx: Math.round(e.centerX), cy: Math.round(e.centerY), en: e.enabled }));
    return { dialogs: pick(/Dialog/i), texts: pick(/TextCtrl/i), buttons: pick(/Button/i), combos: pick(/Choice|ComboBox/i) };
  });
  logs.push(`[spec] after New Footprint: ${JSON.stringify(dlg)}`);

  // If a name dialog is present, type our name and confirm with Enter (default
  // button). Some flows create directly with a default name — handle both.
  const FP = 'SpikeFP';
  if (dlg.texts.length > 0) {
    const nameField = dlg.texts[0];
    await page.mouse.click(nameField.cx, nameField.cy);
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type(FP, { delay: 40 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT('04-name-typed'), scale: 'css' });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: SHOT('05-fp-created'), scale: 'css' });
  logs.push(`[spec] title after create: ${await page.title()}`);

  // Save: focus the canvas, Ctrl+S (the proven save trigger). The New Footprint
  // flow may already auto-save into the writable lib; Ctrl+S is belt-and-braces.
  await focusCanvas(page);
  await page.keyboard.press('Control+s');

  // Wait for the bridge to capture the saved body (name-agnostic — the editor may
  // massage or default the footprint name).
  await page.waitForFunction(
    () => {
      const saved = (window as any).__pcbjamSaved as Record<string, string> | undefined;
      return !!saved && Object.values(saved).some((v) => typeof v === 'string' && v.length > 0);
    },
    null,
    { timeout: 30000 },
  );
  await page.screenshot({ path: SHOT('06-saved'), scale: 'css' });

  const { savedName, body } = await page.evaluate(() => {
    const saved = (window as any).__pcbjamSaved as Record<string, string>;
    const k = Object.keys(saved).find((n) => saved[n]?.length)!;
    return { savedName: k, body: saved[k] };
  });
  logs.push(`[spec] saved "${savedName}" (${body.length} bytes):\n${body}`);

  // The captured body is a well-formed fork-native footprint at the fork's native
  // board/footprint file version (20251028) — proves verbatim round-trip, no shim.
  expect(body).toContain('(footprint');
  expect(body).toContain('(version 20251028)');
  expect(body).toContain('(generator "pcbnew")');
  expect(body).toContain(savedName);

  // No post-save error dialog (the MEMFS placeholder-file fix for the footprint
  // editor's setFPWatcher -> GetModificationTime stat).
  await page.waitForTimeout(500);
  const errDialog = await page.evaluate(() =>
    window.wxElementRegistry
      .findAll({ visible: true })
      .some((e: any) => /Dialog/i.test(e.typeName) && /Error/i.test(e.label || '')),
  );
  expect(errDialog, 'no post-save error dialog').toBe(false);
  expect(
    logs.some((l) => l.includes('Failed to retrieve file times')),
    'no file-times error',
  ).toBe(false);

  // App stayed live: no abort, no OOM respawn (the main-thread Asyncify save gate).
  expect(logs.some((l) => l.includes('Aborted(')), 'no WASM abort').toBe(false);
  expect(new URL(page.url()).searchParams.get('oomRetry'), 'no OOM respawn').toBeNull();

  console.log('--- console + spec log ---\n' + logs.join('\n'));
});
