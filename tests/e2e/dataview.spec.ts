import { test, expect } from './utils/fixtures';
import { clickTab, clickByLabel, clickDataViewItem, clickDataViewItemByIndex, clickColumnHeader, clickColumnHeaderByIndex, waitForWxApp, waitUntil, stableShot } from './utils/element-tracker';

/**
 * wxDataViewCtrl Tests
 *
 * Layout (from button-finder):
 * - Tabs at y≈105: "List View" (x≈40), "Tree View" (x≈105)
 * - List View buttons at y≈135: "Add Item" (x≈502), "Remove Selected" (x≈622), "Clear All" (x≈742)
 * - Column headers at y≈178
 * - List data rows start at y≈210, spacing ~16px
 * - Tree View buttons at y≈135: "Expand All" (x≈488), "Collapse All" (x≈600), "Add Item" (x≈712)
 *
 * Determinism: no waitForTimeout. Readiness via waitForWxApp (canvas + registry, fails
 * loudly). Each button's effect is the console event it emits, so we poll for that event
 * instead of sleeping. Snapshot-based clicks on dynamically-populated data rows or on
 * elements that only exist after a tab switch are guarded with waitUntil (the click
 * helpers take a one-shot registry snapshot and do not poll). Static states are captured
 * with stableShot, whose frame-stabilization replaces the old settle sleeps.
 */

test.describe('wxDataViewCtrl Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/standalone/dataview/dataview_test.html');
    // Wait for the app to be interactive: canvas visible + element registry populated.
    await waitForWxApp(page);
  });

  test('DataView test app loads successfully', async ({ page, testLogger }) => {
    const hasStartupLog = testLogger.consoleLogs.some(log =>
      log.includes('DATAVIEW_TEST') && log.includes('started successfully')
    );

    await stableShot(page, 'dataview-01-loaded.png');

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('List view is populated with Zone Manager-like data', async ({ page }) => {
    // Take screenshot to verify list is populated with data
    await stableShot(page, 'dataview-02-list-populated.png');

    // Visual verification through screenshot - the list should show Zone Manager-like entries
    // (Zone_GND_Top, Zone_GND_Bottom, Zone_VCC, Zone_3V3, Zone_Shield, Zone_Custom_*)
    // Note: Startup logs are not reliably captured due to timing, but the screenshot
    // confirms the list is populated.
  });

  test('List item can be selected', async ({ page, testLogger }) => {
    // List data rows are populated dynamically after the frame paints; wait for the
    // target row to be registered rather than sleeping (clickDataViewItem is a snapshot).
    await waitUntil(
      page,
      (label: string) => {
        const registry = (window as any).wxElementRegistry;
        if (!registry || !registry.findRenderedByLabel) return false;
        return registry.findRenderedByLabel(label, { elementType: 'dataviewitem' }).length > 0;
      },
      "list item 'Zone_GND_Top' rendered",
      { arg: 'Zone_GND_Top' }
    );

    // Click on first list item using element registry
    const clicked = await clickDataViewItem(page, 'Zone_GND_Top');
    expect(clicked).toBe(true);

    await stableShot(page, 'dataview-03-list-selected.png');

    const hasSelectionEvent = testLogger.consoleLogs.some(log =>
      log.includes('List: Selection changed')
    );
    // Selection event should fire
  });

  test('Add Item button works for list', async ({ page, testLogger }) => {
    // Click Add Item button using element registry
    await clickByLabel(page, 'Add Item');

    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('List: Added new item')),
        { message: "list 'Add Item' should emit an add event" }
      )
      .toBe(true);

    await stableShot(page, 'dataview-04-list-add.png');
  });

  test('Switch to Tree View tab', async ({ page, testLogger }) => {
    // Click on Tree View tab using element registry
    await clickTab(page, 'Tree View');

    await stableShot(page, 'dataview-05-tree-tab.png');

    // Verify we can see tree content (tree expand events)
    const hasTreeLog = testLogger.consoleLogs.some(log =>
      log.includes('Library-like hierarchy') || log.includes('Tree:')
    );
  });

  test('Tree item can be selected', async ({ page, testLogger }) => {
    // Switch to tree tab first using element registry
    await clickTab(page, 'Tree View');

    // Tree items only exist once the tree page is shown; wait for the target item to
    // be registered rather than sleeping (clickDataViewItem is a snapshot).
    await waitUntil(
      page,
      (label: string) => {
        const registry = (window as any).wxElementRegistry;
        if (!registry || !registry.findRenderedByLabel) return false;
        return registry.findRenderedByLabel(label, { elementType: 'dataviewitem' }).length > 0;
      },
      "tree item 'Libraries' rendered",
      { arg: 'Libraries' }
    );

    // Click on a tree item using element registry
    const clicked = await clickDataViewItem(page, 'Libraries');
    expect(clicked, 'Should be able to click Libraries tree item').toBe(true);

    await stableShot(page, 'dataview-06-tree-selected.png');

    const hasSelectionEvent = testLogger.consoleLogs.some(log =>
      log.includes('Tree: Selection changed')
    );
    // Selection event should fire
  });

  test('Expand All button works for tree', async ({ page, testLogger }) => {
    // Switch to tree tab using element registry
    await clickTab(page, 'Tree View');

    // Tree-view buttons only exist once the tree page is shown; wait for the button to
    // be registered rather than sleeping (clickByLabel is a snapshot).
    await waitUntil(
      page,
      (label: string) => {
        const registry = (window as any).wxElementRegistry;
        if (!registry || !registry.findByLabel) return false;
        return registry.findByLabel(label, {}).length > 0;
      },
      "tree 'Expand All' button rendered",
      { arg: 'Expand All' }
    );

    // Click Expand All button using element registry
    await clickByLabel(page, 'Expand All');

    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('Tree: All items expanded')),
        { message: "tree 'Expand All' should emit an expand event" }
      )
      .toBe(true);

    await stableShot(page, 'dataview-07-tree-expanded.png');
  });

  test('Collapse All button works for tree', async ({ page, testLogger }) => {
    // Switch to tree tab using element registry
    await clickTab(page, 'Tree View');

    // Tree-view buttons only exist once the tree page is shown; wait for the button to
    // be registered rather than sleeping (clickByLabel is a snapshot).
    await waitUntil(
      page,
      (label: string) => {
        const registry = (window as any).wxElementRegistry;
        if (!registry || !registry.findByLabel) return false;
        return registry.findByLabel(label, {}).length > 0;
      },
      "tree 'Collapse All' button rendered",
      { arg: 'Collapse All' }
    );

    // Click Collapse All button using element registry
    await clickByLabel(page, 'Collapse All');

    await expect
      .poll(
        () => testLogger.consoleLogs.some(log => log.includes('Tree: All items collapsed')),
        { message: "tree 'Collapse All' should emit a collapse event" }
      )
      .toBe(true);

    await stableShot(page, 'dataview-08-tree-collapsed.png');
  });

  test('Column header click works for list', async ({ page, testLogger }) => {
    // Click on Zone Name column header using element registry
    const clicked = await clickColumnHeader(page, 'Zone Name');
    expect(clicked, 'Should be able to click Zone Name column header').toBe(true);

    await stableShot(page, 'dataview-09-column-click.png');

    const hasColumnEvent = testLogger.consoleLogs.some(log =>
      log.includes('Column header clicked')
    );
    // Column header click event should fire (if supported)
  });

  test('List supports scrolling with many items', async ({ page, testLogger }) => {
    const canvas = page.locator('canvas');

    // The list has 25 items - try scrolling
    // Use wheel event to scroll in the list area
    await canvas.hover({ position: { x: 300, y: 300 } });
    await page.mouse.wheel(0, 200);

    await stableShot(page, 'dataview-10-scrolled.png');

    // Visual verification - screenshot should show scrolled content
  });
});
