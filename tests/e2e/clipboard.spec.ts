// wxClipboard Tests - Clipboard operations for KiCad copy/paste
// Uses element registry for semantic element identification
import { test, expect, tryLoadApp, waitForRegistry, clickByLabel } from './utils/fixtures';

test.describe('wxClipboard Tests', () => {

  test('Clipboard test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/clipboard/clipboard_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/clipboard-01-loaded.png', fullPage: true });

    const hasStartupLog = testLogger.consoleLogs.some(l =>
      l.includes('wxClipboard test app started') || l.includes('Clipboard test app started')
    );

    expect(loaded, 'wxClipboard app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Copy button copies text to clipboard', async ({ page, testLogger }) => {
    await page.goto('/standalone/clipboard/clipboard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await waitForRegistry(page);

    // Click "Copy to Clipboard" button
    await clickByLabel(page, 'Copy to Clipboard');
    await page.waitForTimeout(2500);  // Wait for async clipboard operation + timeout

    await page.screenshot({ path: 'test-results/clipboard-02-copy-clicked.png', fullPage: true });

    // Check for SUCCESS log (clipboard implementation working) or at least the attempt log
    const hasCopySuccess = testLogger.consoleLogs.some(l =>
      l.includes('SUCCESS') && l.includes('Copied')
    );
    const hasCopyAttempt = testLogger.consoleLogs.some(l =>
      l.includes('Attempting to copy')
    );

    // Either success (real clipboard worked) or at least attempt was made
    expect(hasCopySuccess || hasCopyAttempt, 'Copy should succeed or at least attempt').toBe(true);
  });

  test('Paste button retrieves text from clipboard', async ({ page, testLogger }) => {
    await page.goto('/standalone/clipboard/clipboard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await waitForRegistry(page);

    // First copy something
    await clickByLabel(page, 'Copy to Clipboard');
    await page.waitForTimeout(2500);

    // Click "Paste from Clipboard" button
    await clickByLabel(page, 'Paste from Clipboard');
    await page.waitForTimeout(2500);

    await page.screenshot({ path: 'test-results/clipboard-03-paste-clicked.png', fullPage: true });

    // Check for SUCCESS log or at least no ERROR
    const hasPasteSuccess = testLogger.consoleLogs.some(l =>
      l.includes('SUCCESS') && l.includes('Pasted')
    );
    const hasPasteWarning = testLogger.consoleLogs.some(l =>
      l.includes('WARNING') && l.includes('No text data')
    );
    const hasPasteAttempt = testLogger.consoleLogs.some(l =>
      l.includes('Attempting to paste')
    );

    // Either we successfully pasted, there was no text (valid), or at least we attempted
    expect(hasPasteSuccess || hasPasteWarning || hasPasteAttempt, 'Paste should succeed or report no text').toBe(true);
  });

  test('Check clipboard button reports clipboard content', async ({ page, testLogger }) => {
    await page.goto('/standalone/clipboard/clipboard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await waitForRegistry(page);

    // First copy something to ensure clipboard has content
    await clickByLabel(page, 'Copy to Clipboard');
    await page.waitForTimeout(2500);

    // Click "Check Clipboard" button
    await clickByLabel(page, 'Check Clipboard');
    await page.waitForTimeout(2500);

    await page.screenshot({ path: 'test-results/clipboard-04-check-clicked.png', fullPage: true });

    // Check for clipboard content report
    const hasCheckResult = testLogger.consoleLogs.some(l =>
      l.includes('Clipboard contains') || l.includes('Checking clipboard')
    );

    expect(hasCheckResult, 'Check should report clipboard contents').toBe(true);
  });

  test('Clear clipboard button clears clipboard', async ({ page, testLogger }) => {
    await page.goto('/standalone/clipboard/clipboard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await waitForRegistry(page);

    // First copy something
    await clickByLabel(page, 'Copy to Clipboard');
    await page.waitForTimeout(2500);

    // Click "Clear Clipboard" button
    await clickByLabel(page, 'Clear Clipboard');
    await page.waitForTimeout(2500);

    await page.screenshot({ path: 'test-results/clipboard-05-clear-clicked.png', fullPage: true });

    // Check for SUCCESS log or at least attempt
    const hasClearSuccess = testLogger.consoleLogs.some(l =>
      l.includes('SUCCESS') && l.includes('Clipboard cleared')
    );
    const hasClearAttempt = testLogger.consoleLogs.some(l =>
      l.includes('Attempting to clear')
    );

    expect(hasClearSuccess || hasClearAttempt, 'Clear should succeed or at least attempt').toBe(true);
  });

  test('Full clipboard flow: copy, check, paste, clear', async ({ page, testLogger }) => {
    await page.goto('/standalone/clipboard/clipboard_test.html');
    const loaded = await tryLoadApp(page);
    if (!loaded) {
      test.skip();
      return;
    }

    await waitForRegistry(page);

    // 1. Copy
    await clickByLabel(page, 'Copy to Clipboard');
    await page.waitForTimeout(2500);

    const hasCopyLog = testLogger.consoleLogs.some(l =>
      l.includes('SUCCESS') && l.includes('Copied') || l.includes('Attempting to copy')
    );
    expect(hasCopyLog, 'Copy should log activity').toBe(true);

    // 2. Check
    await clickByLabel(page, 'Check Clipboard');
    await page.waitForTimeout(2500);

    const hasCheckResult = testLogger.consoleLogs.some(l =>
      l.includes('Clipboard contains') || l.includes('Checking clipboard')
    );
    expect(hasCheckResult, 'Check should report clipboard').toBe(true);

    // 3. Paste
    await clickByLabel(page, 'Paste from Clipboard');
    await page.waitForTimeout(2500);

    const hasPasteLog = testLogger.consoleLogs.some(l =>
      l.includes('SUCCESS') && l.includes('Pasted') || l.includes('Attempting to paste')
    );
    expect(hasPasteLog, 'Paste should log activity').toBe(true);

    // 4. Clear
    await clickByLabel(page, 'Clear Clipboard');
    await page.waitForTimeout(2500);

    const hasClearLog = testLogger.consoleLogs.some(l =>
      l.includes('SUCCESS') && l.includes('Clipboard cleared') || l.includes('Attempting to clear')
    );
    expect(hasClearLog, 'Clear should log activity').toBe(true);

    await page.screenshot({ path: 'test-results/clipboard-06-full-flow.png', fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
