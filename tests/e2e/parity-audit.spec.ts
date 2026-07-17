import { test, expect, tryLoadApp } from './utils/fixtures';

// Red-green reproductions for wxWidgets DOM-port vs native (wxGTK) parity gaps
// found in the parity audit. Each standalone app
// (tests/apps/standalone/<name>/) drives the exact buggy path and self-reports a
// "[REPRO] <name>: PASS/FAIL" line (or exposes live DOM state); the test is RED
// while the bug is present and GREEN after the wasm-layer fix.

// Find the "[REPRO] <name>: ..." line emitted by a repro app.
function reproLine(logs: string[], name: string): string | undefined {
  return logs.find((l) => l.includes(`[REPRO] ${name}:`));
}

async function waitReady(testLogger: { consoleLogs: string[] }, marker: string) {
  await expect
    .poll(() => testLogger.consoleLogs.some((l) => l.includes(marker)), {
      timeout: 30000,
      message: `repro app should emit "${marker}"`,
    })
    .toBe(true);
}

test.describe('wxWidgets DOM-port parity reproductions', () => {
  // C-1 (Critical): wxEVT_CHOICE/LISTBOX/COMBOBOX are hand-rolled and never call
  // InitCommandEventWithItems(), so event.GetClientObject() is always NULL even
  // when the item was appended WITH client data. KiCad's Track & Via Properties
  // dialog static_cast<VIA_DIMENSION*>(aEvent.GetClientData())->... then traps
  // the WASM module on a normal selection. The app appends typed client data and
  // the handler checks the event carries it.
  test('selection events carry per-item client data (choice/listbox/combobox)', async ({
    page,
    testLogger,
  }) => {
    await page.goto('/standalone/selevent-clientdata/selevent-clientdata_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] selevent ready');

    // wxChoice -> <select> (single): pick "Beta" (index 1, client data DATA_B).
    await page.locator('select:not([multiple])').first().selectOption({ index: 1 });
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'choice_clientdata') ?? '', {
        timeout: 10000,
        message: 'wxChoice selection event must carry the item client object',
      })
      .toContain('PASS');

    // wxListBox -> <select multiple>: pick index 1.
    await page.locator('select[multiple]').first().selectOption({ index: 1 });
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'listbox_clientdata') ?? '', {
        timeout: 10000,
        message: 'wxListBox selection event must carry the item client object',
      })
      .toContain('PASS');

    // wxComboBox -> <input list=...>: commit "Beta" (index 1).
    const combo = page.locator('input[list]').first();
    await combo.fill('Beta');
    await combo.dispatchEvent('change');
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'combobox_clientdata') ?? '', {
        timeout: 10000,
        message: 'wxComboBox selection event must carry the item client object',
      })
      .toContain('PASS');
  });
});
