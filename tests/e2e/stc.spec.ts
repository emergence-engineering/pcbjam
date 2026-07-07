import { test, expect } from './utils/fixtures';
import { clickByLabel, waitForWxApp, stableShot } from './utils/element-tracker';

/**
 * wxStyledTextCtrl Tests
 *
 * KiCad uses wxStyledTextCtrl (Scintilla) for:
 * - DRC rules editor
 * - Python console
 * - Custom script editors
 *
 * Layout (from screenshot):
 * - Description text at top
 * - Buttons at y≈107 (centered):
 *   - Python: x≈345
 *   - DRC Rules: x≈433
 *   - Plain: x≈522
 *   - Insert Sample: x≈617
 *   - Clear: x≈719
 *   - Line Numbers: x≈828
 *   - Fold All: x≈932
 * - wxStyledTextCtrl editor area: y≈130 to y≈500
 * - Event log at bottom
 */

test.describe('wxStyledTextCtrl Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/standalone/stc/stc_test.html');
    // Deterministic app-readiness: canvas visible + wx element registry populated.
    await waitForWxApp(page);
  });

  test('STC test app loads successfully', async ({ page, testLogger }) => {
    // Readiness (canvas + registry populated) is handled by beforeEach's waitForWxApp,
    // which is the load gate. The original only asserted no init errors (its startup-log
    // check was computed but never asserted — the app logs [STC_EVENT], not a start line).
    await stableShot(page, 'stc-01-loaded.png');

    expect(testLogger.errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Python syntax highlighting is enabled by default', async ({ page }) => {
    // Visual verification - the editor should show Python code with colors
    // (import, def, for keywords should be highlighted). Static default state.
    await stableShot(page, 'stc-02-python-default.png');
  });

  test('DRC Rules mode can be activated', async ({ page, testLogger }) => {
    // Click DRC Rules button using element registry
    await clickByLabel(page, 'DRC Rules');

    await expect
      .poll(
        () => testLogger.consoleLogs.some((log) => log.includes('DRC rules lexer configured')),
        { message: 'DRC rules lexer configured is logged' }
      )
      .toBe(true);

    await stableShot(page, 'stc-03-drc-mode.png');
  });

  test('Plain text mode can be activated', async ({ page, testLogger }) => {
    // Click Plain button using element registry
    await clickByLabel(page, 'Plain');

    await expect
      .poll(
        () => testLogger.consoleLogs.some((log) => log.includes('Plain text mode enabled')),
        { message: 'Plain text mode enabled is logged' }
      )
      .toBe(true);

    await stableShot(page, 'stc-04-plain-mode.png');
  });

  test('Insert Sample button adds code', async ({ page, testLogger }) => {
    // Click Insert Sample button using element registry
    await clickByLabel(page, 'Insert Sample');

    await expect
      .poll(
        () => testLogger.consoleLogs.some((log) => log.includes('Inserted sample code')),
        { message: 'Inserted sample code is logged' }
      )
      .toBe(true);

    await stableShot(page, 'stc-05-insert-sample.png');
  });

  test('Clear button clears editor content', async ({ page, testLogger }) => {
    // Click Clear button using element registry
    await clickByLabel(page, 'Clear');

    await expect
      .poll(() => testLogger.consoleLogs.some((log) => log.includes('Text cleared')), {
        message: 'Text cleared is logged',
      })
      .toBe(true);

    await stableShot(page, 'stc-06-cleared.png');
  });

  test('Line numbers can be toggled', async ({ page, testLogger }) => {
    // Click Line Numbers button using element registry
    await clickByLabel(page, 'Line Numbers');

    await expect
      .poll(
        () =>
          testLogger.consoleLogs.some(
            (log) => log.includes('Line numbers hidden') || log.includes('Line numbers shown')
          ),
        { message: 'Line numbers toggle is logged' }
      )
      .toBe(true);

    await stableShot(page, 'stc-07-line-numbers-toggle.png');
  });

  test('Fold All button works', async ({ page, testLogger }) => {
    // Click Fold All button using element registry
    await clickByLabel(page, 'Fold All');

    await expect
      .poll(() => testLogger.consoleLogs.some((log) => log.includes('All code folded')), {
        message: 'All code folded is logged',
      })
      .toBe(true);

    await stableShot(page, 'stc-08-folded.png');
  });

  test('Editor can receive text input', async ({ page, testLogger }) => {
    const canvas = page.locator('canvas');

    // Clear the editor first using element registry, and wait deterministically
    // for the clear to commit before typing.
    await clickByLabel(page, 'Clear');
    await expect
      .poll(() => testLogger.consoleLogs.some((log) => log.includes('Text cleared')), {
        message: 'editor reports "Text cleared" before typing',
      })
      .toBe(true);

    // Click in the editor area to focus it
    // STC (Scintilla) has complex internal windowing - click anywhere in editor area
    await canvas.click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: Scintilla focus commit before keystrokes (no observable)

    // Type some text
    await page.keyboard.type('# Test input\nprint("Hello WASM!")');

    await stableShot(page, 'stc-09-typed.png');

    // The text should have triggered change events (logged every 10 changes)
  });

  test('Switching between modes preserves content structure', async ({ page, testLogger }) => {
    // Start with Python mode (default)
    await stableShot(page, 'stc-10a-python.png');

    // Switch to DRC mode using element registry
    await clickByLabel(page, 'DRC Rules');
    await expect
      .poll(
        () => testLogger.consoleLogs.some((log) => log.includes('DRC rules lexer configured')),
        { message: 'DRC rules lexer configured is logged' }
      )
      .toBe(true);
    await stableShot(page, 'stc-10b-drc.png');

    // Switch back to Python using element registry
    await clickByLabel(page, 'Python');
    await stableShot(page, 'stc-10c-python-again.png');

    // Multiple mode switches should work (at least DRC mode change should be logged)
    const modeChanges = testLogger.consoleLogs.filter(
      (log) => log.includes('lexer configured') || log.includes('mode enabled')
    ).length;
    expect(modeChanges).toBeGreaterThanOrEqual(1);
  });
});
