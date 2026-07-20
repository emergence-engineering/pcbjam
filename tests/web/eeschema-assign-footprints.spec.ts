import { test, expect, type Page } from '@playwright/test';
import {
  clickMenuBarItem,
  clickMenuItemByText,
  waitForRegistry,
} from '../e2e/utils/element-tracker';

/**
 * Tools → Assign Footprints... must open CvPcb (feature/cvpcb-wasm).
 *
 * CvPcb is the THIRD statically-linked kiface in the merged kicad_editor
 * image. eeschema's OnOpenCvpcb() asks KIWAY::Player(FRAME_CVPCB); before
 * this feature the WASM kiway had no FACE_CVPCB registered, Player() returned
 * nullptr and the click was a silent no-op. With cvpcb_kiface_getter
 * registered in single_top.cpp's merged branch, the click must create and
 * raise CVPCB_MAINFRAME ("Assign Footprints") and survive the netlist mail
 * round-trip (sendNetlistToCvpcb → MAIL_EESCHEMA_NETLIST).
 *
 * Assertions: the frame appears (page title or a registered element carrying
 * its title), the runtime survives, the screenshot shows the three-pane UI —
 * AND the footprint pane's data went through the wasm↔js libs bridge
 * (window.kicadLibs: fp-index op and/or per-lib list/bodies), with at least
 * one call answered 'ok' by the JS side, i.e. the js↔R2/CDN/backend hop
 * actually served data. The symbols pane needs no bridge: components arrive
 * as a netlist over kiway mail from eeschema, in-process.
 */

const SHOT = (n: string) => `test-results/cvpcb-open-${n}.png`;

/** CvPcb frame visible? The tab title does NOT track the raised frame, and the
 *  frame itself registers without its title as label — the reliable signal is
 *  CvPcb's own bottom-row button ("Apply, Save Schematic && Continue"), which
 *  no other frame has. Title kept as a bonus check. */
async function cvpcbUp(page: Page): Promise<boolean> {
  if (/Assign Footprints/i.test(await page.title())) return true;
  return page.evaluate(() => {
    const reg = (window as any).wxElementRegistry;
    if (!reg) return false;
    return reg
      .findAll({ visible: true })
      .some((e: any) => /Assign Footprints|Save Schematic/i.test(e.label ?? ''));
  });
}

test('Tools → Assign Footprints opens CvPcb (merged third kiface)', async ({ page }) => {
  test.setTimeout(420000);
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Record every window.kicadLibs.request the WASM issues (same wrapper as
  // eeschema-fp-selector.spec.ts): window.__libsCalls = [op,lib,arg,kind,
  // settle][] where settle is 'ok' | 'null' | 'err' once the JS provider
  // (backed by R2/CDN or the reference backend) answers.
  await page.addInitScript(() => {
    const calls: unknown[][] = ((window as any).__libsCalls = []);
    let inner: any;
    Object.defineProperty(window, 'kicadLibs', {
      configurable: true,
      get: () => inner,
      set: (v: any) => {
        if (v && typeof v.request === 'function') {
          const orig = v.request.bind(v);
          v = {
            ...v,
            request: (...a: unknown[]) => {
              const entry = a.slice(0, 4);
              calls.push(entry);
              const p = orig(...a);
              Promise.resolve(p).then(
                (r: unknown) => entry.push(r === null ? 'null' : 'ok'),
                () => entry.push('err'),
              );
              return p;
            },
          };
        }
        inner = v;
      },
    });
  });

  // The FILE deep link (not /-/eeschema, which opens the tool without a file
  // and leaves an untitled empty schematic — no components to assign).
  // ?trace= mirrors the WASM's print/printErr to the browser console and turns
  // on the KICAD_LIBRARIES wxLogTrace channel (library adapter load states).
  await page.goto('/default/projects/demo/demo.kicad_sch?trace=KICAD_LIBRARIES');
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 150000 });
  await waitForRegistry(page, 150000);
  await expect
    .poll(() => page.title(), { timeout: 150000, intervals: [1000] })
    .toMatch(/Schematic Editor/i);
  // The wx UI (canvas, registry, title) is live seconds BEFORE WasmTool drops
  // its opaque boot overlay — `ready` only flips after the collab seed +
  // waitForWxUi. A click in that window lands on the overlay, the Tools popup
  // never opens, and the menu-item wait below times out. Same guard as
  // chrome-toggle.spec.ts: boot + lib fat-load overlays are both `inset-0 z-30`.
  await expect(page.locator('div.inset-0.z-30')).toHaveCount(0, { timeout: 150000 });
  await page.screenshot({ path: SHOT('01-boot'), scale: 'css' });

  expect(await clickMenuBarItem(page, 'Tools'), 'Tools menu opened').toBe(true);
  // Do NOT use clickMenuItemByText: Playwright's mouse.click awaits the input
  // ack from the content process, and if the wx handler synchronously blocks
  // (the failure mode this spec exists to catch) the await deadlocks the test
  // with zero diagnostics. Find the item via the registry, then dispatch the
  // mouse events synthetically — dispatchEvent returns even when the handler
  // later wedges the runtime, so the poll below can report what happened.
  const item = await page.waitForFunction(
    () => {
      const norm = (s: string) => (s || '').replace(/&/g, '').replace(/[.…\s]+$/u, '').trim();
      const reg = (window as any).wxElementRegistry;
      if (!reg || !reg.findAllRendered) return null;
      const hit = reg
        .findAllRendered({ elementType: 'menuitem' })
        .find((e: any) => norm(e.label) === 'Assign Footprints' && e.enabled !== false);
      return hit ? { x: hit.centerX, y: hit.centerY } : null;
    },
    null,
    { timeout: 30000 },
  ).then((h) => h.jsonValue() as Promise<{ x: number; y: number }>);
  await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y) ?? document.body;
    for (const type of ['mousedown', 'mouseup', 'click'] as const) {
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: x, clientY: y, button: 0, buttons: type === 'mousedown' ? 1 : 0,
        }),
      );
    }
  }, item);

  // The ~1/9 "index out of bounds" trap that used to fire right here (a pool
  // worker dying in the footprint AsyncLoad items, then eeschema's EVT.MENU
  // dispatch aborting on the broken future) was root-caused to wxString's
  // UTF-8 build mutating SHARED strings on read-only access from the
  // concurrent workers — fixed in the wx fork (per-thread iterator registry +
  // position cache disabled under Emscripten, include/wx/string.h), with the
  // red/green repro in tests/apps/standalone/wxstring-mt. The
  // eeschema-fp-selector "CI-only" trap (docs/features/web-e2e-rot/01) is the
  // same family (it reproduced on macOS real GL, so it was never
  // llvmpipe-specific).
  //
  // The frame construction + netlist mail runs off wxPostEvent'd follow-ups,
  // which the wx WASM port only flushes on input events — wiggle the mouse
  // while polling. (No auto-answering of prompts here: CvPcb itself shows an
  // OK button, so a blanket "click any OK" would close the very frame under
  // test. The demo schematic is annotated; if ReadyToNetlist() ever prompts,
  // this poll times out and the failure dump + screenshot will show it.)
  const c = { x: 400, y: 300 };
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await page.mouse.move(c.x + (i % 5) * 4, c.y + (i % 3) * 4);
    up = await cvpcbUp(page);
    if (!up) await page.waitForTimeout(1000); // dwell: poll interval while pumping the wx event loop; the surrounding loop asserts `up`
  }

  if (!up) {
    // Diagnostics before failing: what IS on screen, and the console tail.
    const dump = await page.evaluate(() =>
      (window as any).wxElementRegistry
        .findAll({ visible: true })
        .map((e: any) => `${e.typeName ?? '?'}|${e.elementType ?? '?'}|${e.label ?? ''}`)
        .slice(0, 120),
    );
    console.log(`[cvpcb-open] no CvPcb frame; visible elements:\n${dump.join('\n')}`);
    console.log(`[cvpcb-open] console tail:\n${logs.slice(-60).join('\n')}`);
    console.log(
      `[cvpcb-open] libs bridge calls so far:\n${JSON.stringify(
        await page.evaluate(() => (window as any).__libsCalls),
      )}`,
    );
    await page.screenshot({ path: SHOT('99-stuck'), scale: 'css' });
  }
  expect(up, 'CvPcb ("Assign Footprints") frame appeared').toBe(true);

  // Let the frame finish its first paint (footprint/symbol panes), then shoot
  // for eyeball review of the three-pane UI.
  await page.mouse.move(c.x + 2, c.y + 2);
  await page.waitForTimeout(2000); // dwell: let the frame finish its first paint before the eyeball screenshot
  await page.screenshot({ path: SHOT('02-cvpcb'), scale: 'css' });

  // The footprint pane is fed over the wasm↔js libs bridge — poll until
  // footprint-kind traffic shows up (index op for CDN sources and/or per-lib
  // list/bodies fat-loads), pumping the wx loop with mouse moves.
  let fpCalls: string[][] = [];
  for (let i = 0; i < 30; i++) {
    fpCalls = ((await page.evaluate(() => (window as any).__libsCalls)) as string[][]).filter(
      (call) => call[3] === 'footprint',
    );
    if (fpCalls.length > 0) break;
    await page.mouse.move(c.x + (i % 5) * 3, c.y + (i % 3) * 3);
    await page.waitForTimeout(1000); // dwell: poll interval while pumping the wx loop; the surrounding loop asserts fpCalls
  }
  console.log(
    `[cvpcb-open] fp bridge calls: ${JSON.stringify(fpCalls.map((call) => [call[0], call[1], call[2], call[4]]))}`,
  );
  expect(
    fpCalls.length > 0,
    `CvPcb requested footprints over the wasm↔js bridge; all calls:\n${JSON.stringify(
      await page.evaluate(() => (window as any).__libsCalls),
    )}`,
  ).toBe(true);
  // At least one bridge call must have been ANSWERED by the JS side — that
  // answer is the js↔R2/CDN/backend hop actually serving data ('null' means
  // the source has no such artifact, 'err' a failed fetch).
  expect(
    fpCalls.some((call) => call[4] === 'ok'),
    `a footprint bridge call settled 'ok'; fp calls:\n${JSON.stringify(fpCalls)}`,
  ).toBe(true);

  // Runtime survived opening the third kiface + the netlist mail. Match real
  // crash signatures only — app text legitimately contains the word "abort"
  // (AbortAsyncLoad, "aborted=0" traces).
  expect(pageErrors, `no page errors, got:\n${pageErrors.join('\n')}`).toEqual([]);
  expect(
    logs.some((l) => /RuntimeError|Aborted\(|\[boot\] abort|pump error/i.test(l)),
    `no wasm abort; console tail:\n${logs.slice(-15).join('\n')}`,
  ).toBe(false);
});
