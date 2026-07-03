import { test, expect } from './fixtures';
import { waitForPcbnew } from './utils/pcbnew-ready';
import { clickMenuBarItem } from '../e2e/utils/element-tracker';
import type { Page } from '@playwright/test';

// KiCad-level reproduction of the wxWidgets DOM-port "modal dialogs are not
// input-modal" bug (parity audit H-1), fixed in src/wasm/dialog.cpp by creating
// a wxWindowDisabler in wxDialog::ShowModal().
//
// The audit claimed this could not be surfaced as a product test ("e2e tests
// drive only the dialog, so they don't surface it"). It can:
//
// A real modal dialog (wxDialog::ShowModal) is supposed to make the rest of the
// application input-inert until it closes. Native wxWidgets does this by creating
// a wxWindowDisabler, which calls Disable() on every OTHER top-level window. The
// DOM port dropped that one line (dialog.cpp: m_windowDisabler is NULL-inited and
// only ever wxDELETE'd, never new'd), so the parent pcbnew frame stays fully live
// behind a "modal" — its menubar/toolbar/canvas keep accepting input.
//
// The fix (restore `m_windowDisabler = new wxWindowDisabler(this)` in ShowModal)
// disables the main frame. That is directly observable: the WASM port re-emits a
// window's `enabled` flag into window.wxElementRegistry whenever DoEnable() runs
// (window.cpp UpdateElementRegistry), so the pcbnew main frame's registry entry
// flips enabled:true -> false the instant a real modal opens, and back to true on
// close. This is not a proxy for input-modality: the SAME wxWindow::IsEnabled()
// parent-walk that flips this flag is exactly what every input gate consults
// (app.cpp mouse/keyboard/wheel, domevents.cpp control/toolbar/menu-item events).
// enabled===false while a modal is open <=> the frame is input-modal.
//
//   RED  (bug present): PcbFrame.enabled stays `true` while the dialog is open
//                       (no wxWindowDisabler) -> assertion fails.
//   GREEN (fixed):      PcbFrame.enabled is `false` while open, `true` after close.
//
// IMPORTANT — dialog choice: this MUST drive a dialog shown via *real*
// wxDialog::ShowModal(). pcbnew's **Page Settings** dialog qualifies —
// board_editor_control.cpp:534 does `DIALOG_PAGES_SETTINGS dlg( ... );
// dlg.ShowModal()`, and DIALOG_SHIM::ShowModal (dialog_shim.cpp:1386) forwards
// straight to wxDialog::ShowModal without adding a disabler of its own.
//
// Most other pcbnew dialogs are the WRONG target because KiCad already disables
// the parent for them, so they read "green" even unpatched:
//   * Track & Via Properties AND the Plot dialog are both shown via
//     ShowQuasiModal() (edit_tool.cpp:2306, board_editor_control.cpp:565), which
//     runs KiCad's own nested loop and creates a WINDOW_DISABLER(parent)
//     (dialog_shim.cpp:1431) — the parent frame is disabled with or without the
//     wx fix. (Measured: opening Plot on the unpatched binary already reports
//     PcbFrame.enabled === false. So quasi-modal dialogs do NOT exercise H-1.)
// H-1's real user impact in KiCad is therefore limited to the real-ShowModal
// dialogs, which is exactly what this test drives.

// Open the File menu and click the menu item whose label matches `re`
// (menu labels carry a trailing ellipsis, so match by regex). Mirrors the proven
// pattern in plot-checklist.spec.ts.
async function clickFileMenuItem(page: Page, re: RegExp): Promise<string[]> {
  expect(await clickMenuBarItem(page, 'File'), 'File menu should open').toBe(true);
  await page.waitForTimeout(600);
  const items = await page.evaluate(() => {
    const r = window.wxElementRegistry;
    const all = (r?.findAllRendered?.({}) ?? []) as Array<{
      elementType: string;
      label: string;
      centerX: number;
      centerY: number;
    }>;
    return all
      .filter((e) => e.elementType === 'menuitem')
      .map((e) => ({ label: e.label, x: e.centerX, y: e.centerY }));
  });
  const target = items.find((i) => re.test(i.label));
  if (target) await page.mouse.click(target.x, target.y);
  return items.map((i) => i.label);
}

// The visible pcbnew main frame's registry entry (id + live enabled flag).
async function pcbFrame(page: Page): Promise<{ id: string; enabled: boolean } | null> {
  return page.evaluate(() => {
    const r = window.wxElementRegistry;
    if (!r) return null;
    const f = r.findAll({ visible: true }).find((e) => e.name === 'PcbFrame');
    return f ? { id: f.id, enabled: f.enabled } : null;
  });
}

// The live `enabled` flag for a specific registry element id (the disable only
// re-emits the frame's own entry; children entries go stale — so read the frame).
async function enabledById(page: Page, id: string): Promise<boolean | null> {
  return page.evaluate((fid) => {
    const el = window.wxElementRegistry?.getElement(fid);
    return el ? el.enabled : null;
  }, id);
}

// Count currently-visible modal dialogs (KiCad dialog typeNames match /Dialog/i:
// e.g. "wxDialog", "wxFileDialog"). Used as an independent "a modal is open"
// signal that holds in both the RED and GREEN builds.
async function visibleDialogCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      window.wxElementRegistry
        ?.findAll({ visible: true })
        .filter((e) => /Dialog/i.test(e.typeName)).length ?? 0,
  );
}

test.describe('pcbnew modal dialogs are input-modal (H-1)', () => {
  test.describe.configure({ timeout: 240000 });

  test('opening a modal dialog disables the main pcbnew frame', async ({ page, testLogger }) => {
    await page.goto('/kicad/pcbnew.html');
    await waitForPcbnew(page);

    // 1. Baseline: the main frame is registered and enabled, no modal open.
    const before = await pcbFrame(page);
    expect(before, 'PcbFrame should be registered').toBeTruthy();
    expect(before!.enabled, 'main frame is enabled before any modal opens').toBe(true);
    const frameId = before!.id;
    expect(await visibleDialogCount(page), 'no modal dialog open at baseline').toBe(0);

    // 2. Open the Page Settings dialog — a real wxDialog::ShowModal
    //    (board_editor_control.cpp:534). NOT Plot/Track&Via, which are quasi-modal.
    const fileLabels = await clickFileMenuItem(page, /page settings/i);
    console.log('[H1] File menu items: ' + JSON.stringify(fileLabels));

    await expect
      .poll(() => visibleDialogCount(page), {
        timeout: 30000,
        message: 'the Page Settings dialog (a real modal) should open',
      })
      .toBeGreaterThan(0);
    // The disabler is created synchronously inside ShowModal (after Show(true),
    // before startModal() suspends), so the frame is already disabled by the time
    // the modal is parked; a short settle keeps this robust.
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/modal-input-lock-01-dialog.png', scale: 'device' });

    // 3. PRIMARY: while the modal is open, the main pcbnew frame must be
    //    input-disabled. RED (no wxWindowDisabler) -> stays true -> FAILS here.
    const duringModal = await enabledById(page, frameId);
    console.log(`[H1] PcbFrame.enabled while the Page Settings modal is open: ${duringModal}`);
    expect(
      duringModal,
      'the main pcbnew frame must be disabled (input-modal) while a modal dialog is open — H-1',
    ).toBe(false);

    // 4. Closing the modal re-enables the frame (proves the wxDELETE(m_windowDisabler)
    //    teardown path). Esc is KiCad's dialog-cancel.
    await page.keyboard.press('Escape');
    await expect
      .poll(
        async () => {
          if ((await visibleDialogCount(page)) > 0) await page.keyboard.press('Escape');
          return enabledById(page, frameId);
        },
        { timeout: 20000, message: 'closing the modal should re-enable the main frame' },
      )
      .toBe(true);

    await page.screenshot({ path: 'test-results/modal-input-lock-02-closed.png', scale: 'device' });

    // 5. The whole sequence must not trap the WASM module.
    const aborted = [...testLogger.consoleLogs, ...testLogger.errors].some((l) =>
      l.includes('Aborted('),
    );
    expect(aborted, 'the WASM module must not abort while toggling modal state').toBe(false);
  });
});
