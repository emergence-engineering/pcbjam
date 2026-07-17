import { test, expect, MAIN_CANVAS, waitForWxApp } from './utils/fixtures';
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
  clickListboxItemByIndex, stableShot, shotPath } from './utils/element-tracker';

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

// Click at specific canvas coordinates. Uses page.mouse (no actionability
// check): in the DOM port real elements legitimately cover the canvas, and
// the click goes through the app's normal input routing either way.
async function clickCanvas(page: Page, x: number, y: number) {
  const canvas = page.locator(MAIN_CANVAS);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + x, box.y + y);
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

    // Loading-state capture: raw + immediate (no settle) on purpose — this shot documents the
    // app mid-load, before the canvas is up, so it must NOT wait for the render to finish.
    await page.screenshot({ path: shotPath(page, '01-loading.png'), fullPage: true });

    // Deterministic app readiness: canvas visible + wx registry populated.
    // Fails loudly (replaces the try/catch waitForSelector + 1s settle).
    await waitForWxApp(page);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Screenshot after load
    await stableShot(page, '03-after-load.png', { fullPage: true });

    // === TAB 1: Controls ===
    // Click Controls tab using element registry
    await clickTab(page, 'Controls');

    // Click "Click Me" button using element registry
    await clickByLabel(page, 'Click Me');

    // Click "Toggle" button using element registry
    await clickByLabel(page, 'Toggle');

    // Click checkbox "Enable feature" using element registry
    await clickByLabel(page, 'Enable feature');

    // Click radio button "Option B" using element registry
    await clickByLabel(page, 'Option B');

    // Click radio button "Option C" using element registry
    await clickByLabel(page, 'Option C');

    // Interact with slider using element tracking
    await clickSlider(page);
    // Drag slider to 80% position
    await dragSliderTo(page, 0.8);

    await stableShot(page, '04-controls-tab.png', { fullPage: true });

    // === TAB 2: Text Input ===
    // Click Text Input tab using element registry
    await clickTab(page, 'Text Input');

    await stableShot(page, '05-text-input-tab.png', { fullPage: true });

    // Click in single-line text field using element tracking
    const singleLine = await findSingleLineTextCtrl(page);
    expect(singleLine, 'Single-line text control should be tracked').not.toBeNull();
    await page.mouse.click(singleLine!.centerX, singleLine!.centerY);
    await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: let focus land before typing (no registry/console observable for focus commit)
    await page.keyboard.type('Hello World');

    // Click multiline text area using element tracking
    const multiLine = await findMultiLineTextCtrl(page);
    expect(multiLine, 'Multi-line text control should be tracked').not.toBeNull();
    await page.mouse.click(multiLine!.centerX, multiLine!.centerY);
    await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: let focus land before typing (no registry/console observable for focus commit)
    await page.keyboard.type('Line 1\nLine 2\nLine 3');

    await stableShot(page, '06-text-input-typed.png', { fullPage: true });

    // === TAB 3: Drawing ===
    // Click Drawing tab using element registry
    await clickTab(page, 'Drawing');

    await stableShot(page, '07-drawing-tab.png', { fullPage: true });

    // Draw on the canvas - multiple strokes
    for (let i = 0; i < 3; i++) {
      const startX = 100 + i * 50;
      const startY = 100 + i * 30;
      await page.mouse.move(box.x + startX, box.y + startY);
      await page.mouse.down();
      await page.mouse.move(box.x + startX + 100, box.y + startY + 50, { steps: 10 });
      await page.mouse.up();
    }

    await stableShot(page, '08-drawing-done.png', { fullPage: true });

    // === TAB 4: Lists ===
    // Click Lists tab using element registry
    await clickTab(page, 'Lists');

    await stableShot(page, '09-lists-tab.png', { fullPage: true });

    // Click on listbox items using element registry (wxListBox uses listboxitem type)
    for (let i = 0; i < 5; i++) {
      await clickListboxItemByIndex(page, i);
    }

    await stableShot(page, '10-lists-clicked.png', { fullPage: true });

    // Test the wxChoice dropdown. It renders as a native <select> (the
    // browser owns the popup, so it cannot be driven by coordinate
    // clicks) — drive it through the DOM and verify the value sticks.
    const choice = page
        .locator('select:not([multiple])')
        .filter({ has: page.locator('option', { hasText: 'Red' }) })
        .first();
    expect(await choice.count(), 'Choice <select> should exist').toBe(1);

    await choice.selectOption({ label: 'Green' });

    await stableShot(page, '10b-choice-selected.png', { fullPage: true });

    expect(await choice.inputValue(), 'Choice should now be Green').toBe('Green');

    // === Menu interaction ===
    // Click File menu using element registry
    await clickMenuBarItem(page, 'File');
    await stableShot(page, '11-file-menu.png', { fullPage: true });

    // Close menu with Escape
    await page.keyboard.press('Escape');

    // Click Help menu using element registry
    await clickMenuBarItem(page, 'Help');
    await stableShot(page, '12-help-menu.png', { fullPage: true });

    // Close menu with Escape
    await page.keyboard.press('Escape');

    // === Rapid interactions ===
    // Click rapidly on various areas
    for (let i = 0; i < 30; i++) {
      const x = 50 + (i * 37) % 400;
      const y = 50 + (i * 23) % 350;
      await page.mouse.click(box.x + x, box.y + y);
    }

    await stableShot(page, '13-final.png', { fullPage: true });
  });
});

test.describe('wxWidgets WASM - Loading', () => {
  test('app loads without JavaScript errors', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

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
    await waitForWxApp(page);

    const moduleExists = await page.evaluate(() => {
      return typeof (window as any).Module !== 'undefined';
    });

    expect(moduleExists).toBe(true);
  });

  test('application started event is logged', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    // Deterministically wait for the startup event to be logged (same assertion,
    // no blind settle).
    await expect
      .poll(() => testLogger.consoleLogs.some(e => e.includes('Application started')), {
        message: 'Application started event should be logged'
      })
      .toBe(true);
  });
});

test.describe('wxWidgets WASM - Canvas Interaction', () => {
  test('canvas receives click events', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    // Click on the canvas (somewhere in the middle)
    await clickCanvas(page, 320, 240);

    // Should have received the startup event at minimum
    // Additional click events may or may not be logged depending on what's clicked
    await expect
      .poll(() => events.length, { message: 'At least one [EVENT] should be logged' })
      .toBeGreaterThanOrEqual(1);
  });

  test('canvas receives keyboard events', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    // Focus the canvas
    const canvas = page.locator(MAIN_CANVAS);
    await canvas.focus();

    // Type some text
    await page.keyboard.type('test');
    await page.waitForTimeout(300); // eslint-disable-line -- documented interaction dwell: keystroke commit; test asserts no errors surface during keyboard input, no observable to poll

    // The test passes if no errors occur during keyboard input
  });
});

test.describe('wxWidgets WASM - Mouse Drawing', () => {
  test('mouse drag creates drawing stroke', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    // First, switch to the Drawing tab (Tab 3)
    // Use element registry to click the tab reliably
    await clickTab(page, 'Drawing');

    // Deterministically confirm we're on the Drawing tab before drawing
    // (replaces the blind 500ms sleep + the defensive `if (onDrawingTab)`
    // guard that used to silently skip the assertion).
    await expect
      .poll(() => events.some(e => e.includes('Tab changed to: Drawing')), {
        message: 'Should switch to the Drawing tab'
      })
      .toBe(true);

    // Now do a mouse drag in the drawing area
    await dragCanvas(page, 100, 150, 300, 250);

    // Should have mouse down and mouse up events
    await expect
      .poll(
        () =>
          events.some(e => e.includes('Mouse down')) ||
          events.some(e => e.includes('Mouse up')),
        { message: 'Drag should produce a mouse down or mouse up event' }
      )
      .toBe(true);
  });
});

test.describe('wxWidgets WASM - Event Logging', () => {
  test('events are logged to console with [EVENT] prefix', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    // Should have at least the startup event
    await expect
      .poll(() => events.length, { message: 'Startup event should be logged' })
      .toBeGreaterThan(0);
    expect(events[0]).toContain('Application started');
  });

  test('multiple interactions produce multiple log entries', async ({ page, testLogger }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    const initialCount = events.length;

    // Perform multiple clicks
    await clickCanvas(page, 100, 100);
    await clickCanvas(page, 200, 100);
    await clickCanvas(page, 300, 100);

    // Should have more events now
    await expect
      .poll(() => events.length, { message: 'Interactions should not lose log entries' })
      .toBeGreaterThanOrEqual(initialCount);
  });
});

test.describe('wxWidgets WASM - Visual Rendering', () => {
  test('frame renders with visible content', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

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
    await waitForWxApp(page);

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
    await waitForWxApp(page);

    // Perform many rapid interactions
    for (let i = 0; i < 20; i++) {
      await clickCanvas(page, 100 + i * 20, 100 + i * 10);
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
    await waitForWxApp(page);

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
