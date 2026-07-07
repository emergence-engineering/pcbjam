import { test, expect } from './utils/fixtures';
import { clickByLabel, clickTreeItem, findAllTreeItems, waitForWxApp, stableShot } from './utils/element-tracker';

test.describe('wxTreeCtrl Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/standalone/tree/tree_test.html');
    // Deterministic app readiness: canvas visible + wx element registry populated (fails loudly).
    await waitForWxApp(page);
  });

  test('Tree test app loads successfully', async ({ page, testLogger }) => {
    const hasStartupLog = testLogger.consoleLogs.some(log =>
      log.includes('TREE_TEST') && log.includes('started successfully')
    );

    await stableShot(page, 'tree-01-loaded.png');

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Tree is populated with KiCad-like hierarchy', async ({ page, testLogger }) => {
    // Capture the boot hierarchy first (matches the original's tree-02-hierarchy, taken
    // before any interaction). The app logs "populated" only to its on-page event div,
    // not the browser console, so the original's console check was always false and it fell
    // through to clicking Expand All. Prove population deterministically the same way:
    // Expand All emits console expand events that only fire when the tree is populated.
    await stableShot(page, 'tree-02-hierarchy.png');

    expect(await clickByLabel(page, 'Expand All'), 'Expand All button should be clickable').toBe(true);
    await expect
      .poll(
        () =>
          testLogger.consoleLogs.some(log =>
            log.includes('Expanding') || log.includes('All items expanded')
          ),
        { message: 'expanding the tree should emit expand events (proves it is populated)' }
      )
      .toBe(true);
  });

  test('Tree item can be selected', async ({ page, testLogger }) => {
    // Click on a tree item using element registry
    const clicked = await clickTreeItem(page, 'Schematic');
    expect(clicked).toBe(true);

    // Deterministically wait for the selection to commit (was a blind 300ms dwell).
    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('Selection changed')),
        { message: 'tree should emit a "Selection changed" log after clicking an item' }
      )
      .toBe(true);

    await stableShot(page, 'tree-03-selected.png');
  });

  test('Expand All button works', async ({ page, testLogger }) => {
    // Click Expand All button using element registry
    await clickByLabel(page, 'Expand All');

    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('All items expanded')),
        { message: 'tree should emit "All items expanded" after Expand All' }
      )
      .toBe(true);

    await stableShot(page, 'tree-04-expanded.png');
  });

  test('Collapse All button works', async ({ page, testLogger }) => {
    // Click Collapse All button using element registry
    await clickByLabel(page, 'Collapse All');

    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('All items collapsed')),
        { message: 'tree should emit "All items collapsed" after Collapse All' }
      )
      .toBe(true);

    await stableShot(page, 'tree-05-collapsed.png');
  });

  test('Add Item button works with selection', async ({ page, testLogger }) => {
    // First select an item using element registry
    const clicked = await clickTreeItem(page, 'Schematic');
    expect(clicked).toBe(true);

    // Deterministically wait for the selection to commit (was a blind 300ms dwell).
    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('Selection changed')),
        { message: 'tree should emit a "Selection changed" log after clicking an item' }
      )
      .toBe(true);

    // Click Add Item button using element registry
    await clickByLabel(page, 'Add Item');

    await expect
      .poll(
        () =>
          testLogger.consoleLogs.some(log =>
            log.includes('Added new item') || log.includes('No item selected')
          ),
        { message: 'tree should emit "Added new item" / "No item selected" after Add Item' }
      )
      .toBe(true);

    await stableShot(page, 'tree-06-added.png');
  });

  test('Delete Item button works with selection', async ({ page, testLogger }) => {
    // First select an item (not root) using element registry
    const clicked = await clickTreeItem(page, 'Libraries');
    expect(clicked).toBe(true);

    // Deterministically wait for the selection to commit (was a blind 300ms dwell).
    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('Selection changed')),
        { message: 'tree should emit a "Selection changed" log after clicking an item' }
      )
      .toBe(true);

    // Click Delete Selected button using element registry
    await clickByLabel(page, 'Delete Selected');

    await expect
      .poll(
        () =>
          testLogger.consoleLogs.some(log =>
            log.includes('Deleted item') || log.includes('Cannot delete')
          ),
        { message: 'tree should emit "Deleted item" / "Cannot delete" after Delete Selected' }
      )
      .toBe(true);

    await stableShot(page, 'tree-07-deleted.png');
  });
});
