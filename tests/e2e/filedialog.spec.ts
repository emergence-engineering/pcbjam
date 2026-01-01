// wxFileDialog Tests - File dialogs for KiCad open/save operations
// Uses element registry for semantic element identification
import { test, expect, tryLoadApp, waitForRegistry, clickByLabel } from './utils/fixtures';

test.describe('wxFileDialog Tests', () => {

  test('FileDialog test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/filedialog/filedialog_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/filedialog-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('FileDialog test app started'));

    expect(loaded, 'wxFileDialog app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Open file button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/filedialog/filedialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Click "Open File..." button
    await clickByLabel(page, 'Open File...');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/filedialog-02-open-clicked.png', fullPage: true });

    expect(true).toBe(true); // Smoke test
  });

  test('Save file button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/filedialog/filedialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Click "Save File..." button
    await clickByLabel(page, 'Save File...');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/filedialog-03-save-clicked.png', fullPage: true });

    expect(true).toBe(true);
  });

  test('Open multiple button can be clicked', async ({ page, testLogger }) => {
    await page.goto('/standalone/filedialog/filedialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Click "Open Multiple..." button
    await clickByLabel(page, 'Open Multiple...');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/filedialog-04-multiple-clicked.png', fullPage: true });

    expect(true).toBe(true);
  });

  test('All file dialog buttons accessible', async ({ page, testLogger }) => {
    await page.goto('/standalone/filedialog/filedialog_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await waitForRegistry(page);

    // Try all three buttons
    await clickByLabel(page, 'Open File...');
    await page.waitForTimeout(300);
    await clickByLabel(page, 'Save File...');
    await page.waitForTimeout(300);
    await clickByLabel(page, 'Open Multiple...');
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/filedialog-05-all-buttons.png', fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
