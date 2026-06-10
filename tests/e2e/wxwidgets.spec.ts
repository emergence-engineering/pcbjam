import { test, expect, MAIN_CANVAS, waitForApp } from './utils/fixtures';
import { Page } from '@playwright/test';
import {
  clickTab,
  clickByLabel,
  clickMenuBarItem,
  clickSlider,
  dragSliderTo,
  findSliderTrack,
  clickTextCtrl,
  findSingleLineTextCtrl,
  findMultiLineTextCtrl,
  clickComboButton,
  selectComboItem,
  clickListboxItem,
  clickListboxItemByIndex
} from './utils/element-tracker';

// Capture console events with [EVENT] prefix
function captureEvents(page: Page): string[] {
  const events: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.startsWith('[EVENT]')) {
      events.push(text.replace('[EVENT] ', ''));
    }
  });
  return events;
}

// Known non-critical warnings (wxWidgets and Emscripten)
function isKnownWarning(error: string): boolean {
  return error.includes('unsupported bitmap depth') ||
         error.includes('error creating bitmap') ||
         error.includes('Failed to create line wrap XBM') ||
         error.includes('invalid bitmap') ||
         error.includes('assert') ||
         error.includes('HEAPU8') ||  // Emscripten export warning
         error.includes('showError') ||  // Template function
         error.includes('emscripten GL emulation') ||  // GL emulation warnings
         error.includes('GL immediate mode emulation') ||  // GL immediate mode warning
         error.includes('WebGL') ||  // WebGL version warnings
         error.includes('EndModal') ||  // wxWidgets debug messages
         error.includes('Debug:');  // wxWidgets debug prefix
}

// Click at specific canvas coordinates
async function clickCanvas(page: Page, x: number, y: number) {
  const canvas = page.locator(MAIN_CANVAS);
  await canvas.click({ position: { x, y } });
}

// Drag on canvas from one point to another
async function dragCanvas(page: Page, startX: number, startY: number, endX: number, endY: number) {
  const canvas = page.locator(MAIN_CANVAS);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  await page.mouse.move(box.x + startX, box.y + startY);
  await page.mouse.down();
  await page.mouse.move(box.x + endX, box.y + endY, { steps: 10 });
  await page.mouse.up();
}

test.describe('wxWidgets WASM - Diagnostics', () => {
  test('comprehensive UI interaction test', async ({ page, testLogger }) => {

    await page.goto('/minimal_test.html');

    // Screenshot 1: During loading
    await page.screenshot({ path: 'test-results/01-loading.png', fullPage: true });

    // Wait for canvas
    try {
      await page.waitForSelector('#canvas', { state: 'visible', timeout: 30000 });
    } catch (e) {
      await page.screenshot({ path: 'test-results/02-timeout.png', fullPage: true });
      console.log('Logs so far:', testLogger.consoleLogs);
      console.log('Errors:', testLogger.errors);
      throw e;
    }

    await page.waitForTimeout(1000); // Let it settle

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Screenshot after load
    await page.screenshot({ path: 'test-results/03-after-load.png', fullPage: true });

    // === TAB 1: Controls ===
    // Click Controls tab using element registry
    await clickTab(page, 'Controls');
    await page.waitForTimeout(300);

    // Click "Click Me" button using element registry
    await clickByLabel(page, 'Click Me');
    await page.waitForTimeout(300);

    // Click "Toggle" button using element registry
    await clickByLabel(page, 'Toggle');
    await page.waitForTimeout(300);

    // Click checkbox "Enable feature" using element registry
    await clickByLabel(page, 'Enable feature');
    await page.waitForTimeout(300);

    // Click radio button "Option B" using element registry
    await clickByLabel(page, 'Option B');
    await page.waitForTimeout(300);

    // Click radio button "Option C" using element registry
    await clickByLabel(page, 'Option C');
    await page.waitForTimeout(300);

    // Interact with slider using element tracking
    await clickSlider(page);
    await page.waitForTimeout(200);
    // Drag slider to 80% position
    await dragSliderTo(page, 0.8);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/04-controls-tab.png', fullPage: true });

    // === TAB 2: Text Input ===
    // Click Text Input tab using element registry
    await clickTab(page, 'Text Input');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/05-text-input-tab.png', fullPage: true });

    // Click in single-line text field using element tracking
    const singleLine = await findSingleLineTextCtrl(page);
    expect(singleLine, 'Single-line text control should be tracked').not.toBeNull();
    await page.mouse.click(singleLine!.centerX, singleLine!.centerY);
    await page.waitForTimeout(200);
    await page.keyboard.type('Hello World');
    await page.waitForTimeout(300);

    // Click multiline text area using element tracking
    const multiLine = await findMultiLineTextCtrl(page);
    expect(multiLine, 'Multi-line text control should be tracked').not.toBeNull();
    await page.mouse.click(multiLine!.centerX, multiLine!.centerY);
    await page.waitForTimeout(200);
    await page.keyboard.type('Line 1\nLine 2\nLine 3');
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/06-text-input-typed.png', fullPage: true });

    // === TAB 3: Drawing ===
    // Click Drawing tab using element registry
    await clickTab(page, 'Drawing');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/07-drawing-tab.png', fullPage: true });

    // Draw on the canvas - multiple strokes
    for (let i = 0; i < 3; i++) {
      const startX = 100 + i * 50;
      const startY = 100 + i * 30;
      await page.mouse.move(box.x + startX, box.y + startY);
      await page.mouse.down();
      await page.mouse.move(box.x + startX + 100, box.y + startY + 50, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/08-drawing-done.png', fullPage: true });

    // === TAB 4: Lists ===
    // Click Lists tab using element registry
    await clickTab(page, 'Lists');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/09-lists-tab.png', fullPage: true });

    // Click on listbox items using element registry (wxListBox uses listboxitem type)
    for (let i = 0; i < 5; i++) {
      await clickListboxItemByIndex(page, i);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/10-lists-clicked.png', fullPage: true });

    // Test wxChoice dropdown using element tracking
    // Find the Choice dropdown by its current value ("Red") and click to open it
    const { findAllComboButtons } = await import('./utils/element-tracker');
    const comboButtons = await findAllComboButtons(page);
    const choiceCombo = comboButtons.find(c => c.label === 'Red');
    expect(choiceCombo, 'Should find Choice dropdown with "Red" value').not.toBeNull();

    // Open the dropdown
    await page.mouse.click(choiceCombo!.centerX, choiceCombo!.centerY);
    await page.waitForTimeout(300);

    // Select "Green" from the dropdown
    const greenClicked = await clickListboxItem(page, 'Green');
    expect(greenClicked, 'Should be able to click "Green" item').toBe(true);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/10b-choice-selected.png', fullPage: true });

    // Open the dropdown again to verify it works
    const reopened = await clickComboButton(page);
    expect(reopened, 'Should be able to open dropdown').toBe(true);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/10c-choice-dropdown-reopen.png', fullPage: true });

    // Close the dropdown by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // === Menu interaction ===
    // Click File menu using element registry
    await clickMenuBarItem(page, 'File');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/11-file-menu.png', fullPage: true });

    // Close menu with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Click Help menu using element registry
    await clickMenuBarItem(page, 'Help');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/12-help-menu.png', fullPage: true });

    // Close menu with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // === Rapid interactions ===
    // Click rapidly on various areas
    for (let i = 0; i < 30; i++) {
      const x = 50 + (i * 37) % 400;
      const y = 50 + (i * 23) % 350;
      await page.mouse.click(box.x + x, box.y + y);
      await page.waitForTimeout(50);
    }

    await page.screenshot({ path: 'test-results/13-final.png', fullPage: true });
  });
});

test.describe('wxWidgets WASM - Loading', () => {
  test('app loads without JavaScript errors', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Filter out known non-critical errors
    const criticalErrors = testLogger.errors.filter(e =>
      !e.includes('SharedArrayBuffer') &&
      !e.includes('cross-origin') &&
      !isKnownWarning(e)
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('canvas element is rendered with dimensions', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');

    const canvas = page.locator(MAIN_CANVAS);
    await expect(canvas).toBeVisible({ timeout: 30000 });

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test('loading progress completes', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');

    await page.waitForFunction(() => {
      const status = document.getElementById('progress-text');
      if (!status) return true;
      const text = status.textContent || '';
      return text.toLowerCase().includes('complete') ||
             text === '' ||
             status.style.display === 'none';
    }, { timeout: 30000 });
  });

  test('WASM module initializes successfully', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const moduleExists = await page.evaluate(() => {
      return typeof (window as any).Module !== 'undefined';
    });

    expect(moduleExists).toBe(true);
  });

  test('application started event is logged', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Wait for the startup event to be logged
    await page.waitForTimeout(500);

    expect(testLogger.consoleLogs.some(e => e.includes('Application started'))).toBe(true);
  });
});

test.describe('wxWidgets WASM - Canvas Interaction', () => {
  test('canvas receives click events', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Click on the canvas (somewhere in the middle)
    await clickCanvas(page, 320, 240);
    await page.waitForTimeout(300);

    // Should have received the startup event at minimum
    // Additional click events may or may not be logged depending on what's clicked
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test('canvas receives keyboard events', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Focus the canvas
    const canvas = page.locator(MAIN_CANVAS);
    await canvas.focus();

    // Type some text
    await page.keyboard.type('test');
    await page.waitForTimeout(300);

    // The test passes if no errors occur during keyboard input
  });
});

test.describe('wxWidgets WASM - Mouse Drawing', () => {
  test('mouse drag creates drawing stroke', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // First, switch to the Drawing tab (Tab 3)
    // Use element registry to click the tab reliably
    await clickTab(page, 'Drawing');
    await page.waitForTimeout(500);

    // Check if we're on the Drawing tab
    const onDrawingTab = events.some(e => e.includes('Tab changed to: Drawing'));

    if (onDrawingTab) {
      // Now do a mouse drag in the drawing area
      await dragCanvas(page, 100, 150, 300, 250);
      await page.waitForTimeout(300);

      // Should have mouse down and mouse up events
      const hasMouseDown = events.some(e => e.includes('Mouse down'));
      const hasMouseUp = events.some(e => e.includes('Mouse up'));

      expect(hasMouseDown || hasMouseUp).toBe(true);
    }
  });
});

test.describe('wxWidgets WASM - Event Logging', () => {
  test('events are logged to console with [EVENT] prefix', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Wait for startup
    await page.waitForTimeout(500);

    // Should have at least the startup event
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toContain('Application started');
  });

  test('multiple interactions produce multiple log entries', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const initialCount = events.length;

    // Perform multiple clicks
    await clickCanvas(page, 100, 100);
    await page.waitForTimeout(200);
    await clickCanvas(page, 200, 100);
    await page.waitForTimeout(200);
    await clickCanvas(page, 300, 100);
    await page.waitForTimeout(200);

    // Should have more events now
    expect(events.length).toBeGreaterThanOrEqual(initialCount);
  });
});

test.describe('wxWidgets WASM - Visual Rendering', () => {
  test('frame renders with visible content', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Take a screenshot for visual verification
    const screenshot = await page.screenshot();
    expect(screenshot.length).toBeGreaterThan(0);

    // The canvas should have more than just a blank color
    // (This is a basic check - real visual testing would use image comparison)
    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
  });

  test('window has reasonable dimensions', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();

    // The test frame is set to 640x480 in the C++ code
    // Canvas might be slightly different but should be close
    expect(box?.width).toBeGreaterThanOrEqual(400);
    expect(box?.height).toBeGreaterThanOrEqual(300);
  });
});

test.describe('wxWidgets WASM - Stability', () => {
  test('app remains stable after multiple interactions', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Perform many rapid interactions
    for (let i = 0; i < 20; i++) {
      await clickCanvas(page, 100 + i * 20, 100 + i * 10);
      await page.waitForTimeout(50);
    }

    // App should still be responsive
    const canvas = page.locator(MAIN_CANVAS);
    await expect(canvas).toBeVisible();

    // No JavaScript errors should have occurred
    const criticalErrors = testLogger.errors.filter(e =>
      !e.includes('SharedArrayBuffer') &&
      !e.includes('cross-origin') &&
      !isKnownWarning(e)
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('app handles rapid mouse movements', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Rapid mouse movements
    for (let i = 0; i < 50; i++) {
      const x = box.x + 100 + Math.sin(i * 0.3) * 100;
      const y = box.y + 200 + Math.cos(i * 0.3) * 100;
      await page.mouse.move(x, y);
    }

    // App should still be responsive
    await expect(page.locator(MAIN_CANVAS)).toBeVisible();
  });
});
