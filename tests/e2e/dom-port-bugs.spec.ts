import { test, expect, tryLoadApp } from './utils/fixtures';

// Red-green reproductions for the two DOM-port bugs in
// docs/features/wx-dom-port/branch-review.md.
//
// Each standalone app (tests/apps/standalone/{textctrl-reentry,tooltip-lifetime})
// exercises the exact buggy path; the test is RED while the bug is present and
// GREEN after the wasm-layer fix.

function reproLine(logs: string[], name: string): string | undefined {
  return logs.find((l) => l.includes(`[REPRO] ${name}:`));
}

test.describe('wx DOM-port bug reproductions', () => {
  // textctrl.cpp OnDomEvent(INPUT) sets m_inDomInput=true, fires wxEVT_TEXT, then
  // resets it — but the reset is skipped if a handler throws, wedging the flag and
  // silently dropping every later programmatic value push. Driven through the real
  // path: typing fires a genuine DOM 'input' event whose wxEVT_TEXT handler throws
  // (caught at wx-dom.js's dispatch() boundary); a button then does a programmatic
  // ChangeValue() that must still reach the element.
  test('wxTextCtrl: a throwing wxEVT_TEXT handler must not wedge DOM sync', async ({
    page,
    testLogger,
  }) => {
    await page.goto('/standalone/textctrl-reentry/textctrl-reentry_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);

    await expect
      .poll(() => testLogger.consoleLogs.some((l) => l.includes('[REPRO] textctrl ready')), {
        timeout: 30000,
        message: 'repro app should finish setup',
      })
      .toBe(true);

    const input = page.locator('input').first();
    await input.click();
    await input.pressSequentially('x'); // real DOM 'input' -> wxEVT_TEXT -> throw

    await page.getByRole('button', { name: 'Set Programmatic' }).click(); // ChangeValue

    // The programmatic value must reach the element. RED if the throw wedged
    // m_inDomInput (the element keeps the typed "x").
    await expect
      .poll(async () => await input.inputValue(), {
        timeout: 10000,
        message: 'programmatic ChangeValue must reach the <input> after a throwing handler',
      })
      .toBe('PROGRAMMATIC_OK');
  });

  // tooltip.cpp keeps gs_hoverWindow as a raw pointer dereferenced 600ms later by
  // the tooltip timer; nothing clears it when the window is destroyed, so a window
  // freed within the delay leaves a dangling pointer (UAF). The app arms the hover,
  // destroys the window, and self-reports whether the pointer was cleared.
  test('wxToolTip: the hover-window pointer must not outlive its window', async ({
    page,
    testLogger,
  }) => {
    const name = 'tooltip_hover_window_cleared_on_destroy';
    await page.goto('/standalone/tooltip-lifetime/tooltip-lifetime_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);

    await expect
      .poll(() => reproLine(testLogger.consoleLogs, name) ?? null, {
        timeout: 30000,
        message: `repro app should emit its [REPRO] ${name} result line`,
      })
      .not.toBeNull();

    const line = reproLine(testLogger.consoleLogs, name)!;
    expect(line, `repro line was: ${line}`).toContain(`[REPRO] ${name}: PASS`);
  });
});
