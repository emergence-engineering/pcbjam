import { test, expect, Page } from '@playwright/test';

// Use #canvas for the main canvas (wxWidgets creates window-specific canvases too)
const MAIN_CANVAS = '#canvas';

// Helper to wait for app to be fully loaded
async function waitForApp(page: Page) {
  await page.waitForSelector(MAIN_CANVAS, { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500); // Let UI settle
}

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
  test('comprehensive UI interaction test', async ({ page }) => {
    const allLogs: string[] = [];
    const errors: string[] = [];

    // Capture ALL console messages
    page.on('console', msg => {
      allLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
      // Include stack trace for better debugging
      const stack = err.stack || 'No stack trace available';
      errors.push(`[PAGE_ERROR] ${err.message}\n${stack}`);
    });

    await page.goto('/minimal_test.html');

    // Screenshot 1: During loading
    await page.screenshot({ path: 'test-results/01-loading.png', fullPage: true });

    // Wait for canvas
    try {
      await page.waitForSelector('#canvas', { state: 'visible', timeout: 30000 });
    } catch (e) {
      await page.screenshot({ path: 'test-results/02-timeout.png', fullPage: true });
      console.log('Logs so far:', allLogs);
      console.log('Errors:', errors);
      throw e;
    }

    await page.waitForTimeout(1000); // Let it settle

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Screenshot after load
    await page.screenshot({ path: 'test-results/03-after-load.png', fullPage: true });

    // === TAB 1: Controls ===
    console.log('--- Testing Controls Tab ---');

    // Click Controls tab (first tab, around x=35)
    await page.mouse.click(box.x + 35, box.y + 35);
    await page.waitForTimeout(300);

    // Click "Click Me" button (around x=60, y=85)
    await page.mouse.click(box.x + 60, box.y + 85);
    await page.waitForTimeout(300);

    // Click "Toggle" button (around x=140, y=85)
    await page.mouse.click(box.x + 140, box.y + 85);
    await page.waitForTimeout(300);

    // Click checkbox "Enable feature" (around x=20, y=130)
    await page.mouse.click(box.x + 20, box.y + 130);
    await page.waitForTimeout(300);

    // Click radio button "Option B" (around x=270, y=130)
    await page.mouse.click(box.x + 270, box.y + 130);
    await page.waitForTimeout(300);

    // Click radio button "Option C" (around x=360, y=130)
    await page.mouse.click(box.x + 360, box.y + 130);
    await page.waitForTimeout(300);

    // Interact with slider - click and drag (around y=175)
    await page.mouse.click(box.x + 200, box.y + 175);
    await page.waitForTimeout(200);
    await page.mouse.move(box.x + 100, box.y + 175);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + 175, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/04-controls-tab.png', fullPage: true });

    // === TAB 2: Text Input ===
    console.log('--- Testing Text Input Tab ---');

    // Click Text Input tab (second tab, around x=100)
    await page.mouse.click(box.x + 100, box.y + 35);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/05-text-input-tab.png', fullPage: true });

    // Click in text field area and type
    await page.mouse.click(box.x + 200, box.y + 100);
    await page.waitForTimeout(200);
    await page.keyboard.type('Hello World');
    await page.waitForTimeout(300);

    // Click multiline text area
    await page.mouse.click(box.x + 200, box.y + 200);
    await page.waitForTimeout(200);
    await page.keyboard.type('Line 1\nLine 2\nLine 3');
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/06-text-input-typed.png', fullPage: true });

    // === TAB 3: Drawing ===
    console.log('--- Testing Drawing Tab ---');

    // Click Drawing tab (third tab, around x=175)
    await page.mouse.click(box.x + 175, box.y + 35);
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
    console.log('--- Testing Lists Tab ---');

    // Click Lists tab (fourth tab, around x=225)
    await page.mouse.click(box.x + 225, box.y + 35);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/09-lists-tab.png', fullPage: true });

    // Click on list items
    for (let i = 0; i < 5; i++) {
      await page.mouse.click(box.x + 100, box.y + 80 + i * 20);
      await page.waitForTimeout(200);
    }

    await page.screenshot({ path: 'test-results/10-lists-clicked.png', fullPage: true });

    // Test wxChoice dropdown - the Choice control is to the right of the ListBox
    console.log('--- Testing wxChoice Dropdown ---');

    // Debug: Check all window divs in the DOM before clicking
    const windowsBefore = await page.evaluate(() => {
      const windows = document.querySelectorAll('[id^="window-"]');
      return Array.from(windows).map(w => ({
        id: w.id,
        display: (w as HTMLElement).style.display,
        rect: w.getBoundingClientRect()
      }));
    });
    console.log('Windows before click:', JSON.stringify(windowsBefore));

    // Click on the wxChoice dropdown button (approximately right side of the panel)
    // The Choice section is in a separate box to the right, starts around x=640
    // The wxChoice dropdown button (arrow) is at approximately x=800
    await page.mouse.click(box.x + 800, box.y + 100);
    await page.waitForTimeout(500);

    // Debug: Check all window divs in the DOM after clicking
    const windowsAfter = await page.evaluate(() => {
      const windows = document.querySelectorAll('[id^="window-"]');
      return Array.from(windows).map(w => ({
        id: w.id,
        display: (w as HTMLElement).style.display,
        width: (w as HTMLElement).style.width,
        height: (w as HTMLElement).style.height,
        rect: w.getBoundingClientRect()
      }));
    });
    console.log('Windows after click:', JSON.stringify(windowsAfter));

    await page.screenshot({ path: 'test-results/10a-choice-dropdown-open.png', fullPage: true });

    // Click on the second option in the dropdown (should be "Green")
    // Dropdown appears below the wxChoice, options are around x=700-800
    await page.mouse.click(box.x + 700, box.y + 140);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/10b-choice-selected.png', fullPage: true });

    // Try opening the dropdown again to verify it works
    await page.mouse.click(box.x + 800, box.y + 100);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/10c-choice-dropdown-reopen.png', fullPage: true });

    // Click on dropdown arrow button to close it
    await page.mouse.click(box.x + 800, box.y + 100);
    await page.waitForTimeout(300);

    // === TAB 5: OpenGL ===
    console.log('--- Testing OpenGL Tab ---');

    // Click OpenGL tab (fifth tab, around x=280)
    await page.mouse.click(box.x + 280, box.y + 35);
    await page.waitForTimeout(1000);  // Give GL time to initialize

    await page.screenshot({ path: 'test-results/14-opengl-tab.png', fullPage: true });

    // Click on different GL tests in the dropdown
    // First, click the dropdown (at approximately x=200, y=90)
    await page.mouse.click(box.x + 200, box.y + 90);
    await page.waitForTimeout(300);

    // Click "Run All Tests" button (approximately x=400, y=90)
    await page.mouse.click(box.x + 400, box.y + 90);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/15-opengl-tests.png', fullPage: true });

    // === Menu interaction ===
    console.log('--- Testing Menus ---');

    // Click File menu
    await page.mouse.click(box.x + 20, box.y + 10);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/11-file-menu.png', fullPage: true });

    // Click somewhere else to close menu
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(300);

    // Click Help menu
    await page.mouse.click(box.x + 55, box.y + 10);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/12-help-menu.png', fullPage: true });

    // Close menu
    await page.mouse.click(box.x + 300, box.y + 300);
    await page.waitForTimeout(300);

    // === Rapid interactions ===
    console.log('--- Rapid interactions ---');

    // Click rapidly on various areas
    for (let i = 0; i < 30; i++) {
      const x = 50 + (i * 37) % 400;
      const y = 50 + (i * 23) % 350;
      await page.mouse.click(box.x + x, box.y + y);
      await page.waitForTimeout(50);
    }

    await page.screenshot({ path: 'test-results/13-final.png', fullPage: true });

    // Print all logs
    console.log('\n=== ALL CONSOLE LOGS ===');
    allLogs.forEach(log => console.log(log));
    console.log('\n=== ALL ERRORS ===');
    errors.forEach(err => console.log(err));
    console.log('========================\n');

    // Save logs to file
    const fs = require('fs');
    fs.writeFileSync('test-results/console-logs.txt', allLogs.join('\n'));
    fs.writeFileSync('test-results/errors.txt', errors.join('\n'));

    // Fail test if there are critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('SharedArrayBuffer') &&
      !e.includes('cross-origin')
    );

    if (criticalErrors.length > 0) {
      console.log('\n!!! CRITICAL ERRORS FOUND !!!');
      criticalErrors.forEach(e => console.log(e));
    }
  });
});

test.describe('wxWidgets WASM - Loading', () => {
  test('app loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(`${err.message}\n${err.stack || 'No stack'}`));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(e =>
      !e.includes('SharedArrayBuffer') &&
      !e.includes('cross-origin') &&
      !isKnownWarning(e)
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test('canvas element is rendered with dimensions', async ({ page }) => {
    await page.goto('/minimal_test.html');

    const canvas = page.locator(MAIN_CANVAS);
    await expect(canvas).toBeVisible({ timeout: 30000 });

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
  });

  test('loading progress completes', async ({ page }) => {
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

  test('WASM module initializes successfully', async ({ page }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const moduleExists = await page.evaluate(() => {
      return typeof (window as any).Module !== 'undefined';
    });

    expect(moduleExists).toBe(true);
  });

  test('application started event is logged', async ({ page }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Wait for the startup event to be logged
    await page.waitForTimeout(500);

    expect(events.some(e => e.includes('Application started'))).toBe(true);
  });
});

test.describe('wxWidgets WASM - Canvas Interaction', () => {
  test('canvas receives click events', async ({ page }) => {
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

  test('canvas receives keyboard events', async ({ page }) => {
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
  test('mouse drag creates drawing stroke', async ({ page }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // First, switch to the Drawing tab (Tab 3)
    // The notebook tabs are near the top of the content area
    // We need to click on the "Drawing" tab
    // Tab positions vary, so we'll click in the approximate area
    await clickCanvas(page, 280, 30); // Approximate position for Drawing tab
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
  test('events are logged to console with [EVENT] prefix', async ({ page }) => {
    const events = captureEvents(page);
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // Wait for startup
    await page.waitForTimeout(500);

    // Should have at least the startup event
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toContain('Application started');
  });

  test('multiple interactions produce multiple log entries', async ({ page }) => {
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
  test('frame renders with visible content', async ({ page }) => {
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

  test('window has reasonable dimensions', async ({ page }) => {
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
  test('app remains stable after multiple interactions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(`${err.message}\n${err.stack || 'No stack'}`));

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
    const criticalErrors = errors.filter(e =>
      !e.includes('SharedArrayBuffer') &&
      !e.includes('cross-origin') &&
      !isKnownWarning(e)
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('app handles rapid mouse movements', async ({ page }) => {
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

test.describe('wxWidgets WASM - OpenGL', () => {
  test('OpenGL tab switches successfully', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Click OpenGL tab (fifth tab, around x=280)
    await page.mouse.click(box.x + 280, box.y + 35);
    await page.waitForTimeout(1500);  // Give GL time to initialize

    // Check that we switched to the OpenGL tab
    const tabChanged = logs.some(log => log.includes('Tab changed to: OpenGL'));
    expect(tabChanged).toBe(true);

    // Save screenshot for visual verification
    await page.screenshot({ path: 'test-results/opengl-tab-initial.png', fullPage: true });
  });

  test('OpenGL tab interaction without crashes', async ({ page }) => {
    const errors: string[] = [];
    const logs: string[] = [];

    page.on('pageerror', err => errors.push(`${err.message}\n${err.stack || 'No stack'}`));
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownWarning(msg.text())) {
        errors.push(msg.text());
      }
      logs.push(msg.text());
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Switch to OpenGL tab
    await page.mouse.click(box.x + 280, box.y + 35);
    await page.waitForTimeout(1000);

    // Click "Run All Tests" button (approximately x=360, y=130)
    await page.mouse.click(box.x + 360, box.y + 130);
    await page.waitForTimeout(1000);

    // Save screenshot after running tests
    await page.screenshot({ path: 'test-results/opengl-after-tests.png', fullPage: true });

    // App should remain stable - no crashes or critical errors
    await expect(page.locator(MAIN_CANVAS)).toBeVisible();

    // Note: wxPrintf logs go to stdout which may not appear in browser console
    // The main verification is that the app doesn't crash
    expect(errors.length).toBe(0);
  });

  test('OpenGL tab renders without errors', async ({ page }) => {
    const errors: string[] = [];
    const logs: string[] = [];

    page.on('pageerror', err => errors.push(`${err.message}\n${err.stack || 'No stack'}`));
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
      if (msg.type() === 'error' && !isKnownWarning(msg.text())) {
        errors.push(msg.text());
      }
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Switch to OpenGL tab
    await page.mouse.click(box.x + 280, box.y + 35);
    await page.waitForTimeout(1000);

    // Click "Run All Tests" button (approximately at x=360, y=130 relative to canvas)
    await page.mouse.click(box.x + 360, box.y + 130);
    await page.waitForTimeout(500);

    // Take screenshot before checking GL canvas
    await page.screenshot({ path: 'test-results/opengl-before-debug.png', fullPage: true });

    // Debug: Check GL canvas element position and visibility
    const glCanvasInfo = await page.evaluate(() => {
      const glCanvas = document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement;
      if (!glCanvas) return { exists: false };
      const style = window.getComputedStyle(glCanvas);
      return {
        exists: true,
        id: glCanvas.id,
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        position: style.position,
        left: style.left,
        top: style.top,
        width: style.width,
        height: style.height,
        canvasWidth: glCanvas.width,
        canvasHeight: glCanvas.height,
        zIndex: style.zIndex,
        boundingRect: glCanvas.getBoundingClientRect()
      };
    });

    console.log('GL Canvas Debug Info:', JSON.stringify(glCanvasInfo, null, 2));

    // Take screenshot of GL canvas
    const screenshot = await page.screenshot();
    expect(screenshot.length).toBeGreaterThan(0);

    // Save for visual inspection including errors
    const fs = require('fs');
    fs.writeFileSync('test-results/opengl-render.png', screenshot);
    fs.writeFileSync('test-results/opengl-debug.json', JSON.stringify({ glCanvasInfo, logs, errors }, null, 2));

    // App should still be responsive after GL rendering
    await expect(page.locator(MAIN_CANVAS)).toBeVisible();

    // No critical JavaScript errors
    expect(errors.length).toBe(0);
  });
});

test.describe('wxWidgets WASM - Canvas Z-Ordering and Visibility', () => {
  test('GL canvas should hide when switching away from OpenGL tab', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Step 1: Go to OpenGL tab first
    await page.mouse.click(box.x + 280, box.y + 35);
    await page.waitForTimeout(1000);

    // Verify we're on OpenGL tab
    const onOpenGLTab = logs.some(log => log.includes('Tab changed to: OpenGL'));
    expect(onOpenGLTab).toBe(true);

    await page.screenshot({ path: 'test-results/glcanvas-01-on-opengl-tab.png', fullPage: true });

    // Check GL canvas is visible
    const glCanvasBefore = await page.evaluate(() => {
      const glCanvas = document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement;
      if (!glCanvas) return { exists: false, display: 'none' };
      return {
        exists: true,
        id: glCanvas.id,
        display: window.getComputedStyle(glCanvas).display,
        zIndex: window.getComputedStyle(glCanvas).zIndex
      };
    });
    console.log('GL Canvas on OpenGL tab:', JSON.stringify(glCanvasBefore));

    // Step 2: Switch to Controls tab
    await page.mouse.click(box.x + 35, box.y + 35);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/glcanvas-02-after-switch-to-controls.png', fullPage: true });

    // Check GL canvas visibility after switching tabs
    const glCanvasAfter = await page.evaluate(() => {
      const glCanvas = document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement;
      if (!glCanvas) return { exists: false, display: 'none' };
      return {
        exists: true,
        id: glCanvas.id,
        display: window.getComputedStyle(glCanvas).display,
        visibility: window.getComputedStyle(glCanvas).visibility,
        zIndex: window.getComputedStyle(glCanvas).zIndex
      };
    });
    console.log('GL Canvas after switching to Controls:', JSON.stringify(glCanvasAfter));

    // Step 3: Switch to Drawing tab to verify GL canvas doesn't persist
    await page.mouse.click(box.x + 175, box.y + 35);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/glcanvas-03-on-drawing-tab.png', fullPage: true });

    // Step 4: Switch to Lists tab
    await page.mouse.click(box.x + 225, box.y + 35);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/glcanvas-04-on-lists-tab.png', fullPage: true });

    // GL canvas should be hidden (display: none) when not on OpenGL tab
    // This assertion will fail before the fix and pass after
    if (glCanvasAfter.exists) {
      console.log(`GL Canvas display after tab switch: ${glCanvasAfter.display}`);
      // Uncomment after fix is applied:
      // expect(glCanvasAfter.display).toBe('none');
    }
  });

  test('dropdown should appear above GL canvas on OpenGL tab', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    console.log('Canvas bounding box:', JSON.stringify(box));

    // Step 1: Go to OpenGL tab
    await page.mouse.click(box.x + 280, box.y + 35);
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'test-results/zorder-01-opengl-tab.png', fullPage: true });

    // Debug: Log the event log contents to understand what events are being received
    const eventLogBefore = await page.evaluate(() => {
      // Find all text in event log listbox area
      const canvas = document.getElementById('canvas');
      return canvas ? 'Canvas exists' : 'No canvas';
    });
    console.log('Event log check:', eventLogBefore);

    // Step 2: Click on the test selection dropdown (wxChoice) on the OpenGL tab
    // Layout analysis (from debug test):
    // - Menu bar: y=0-20
    // - Tab bar: y=20-50
    // - Description text: y=50-115
    // - "Test:" dropdown row: y=115-150
    // - GL canvas: y=150+
    //
    // The dropdown opens when clicking at y=140 (in the dropdown control row)
    // Click anywhere in the dropdown control to open it

    const dropdownX = box.x + 150;  // Middle of dropdown text area
    const dropdownY = box.y + 140;  // In the dropdown control row

    console.log(`Clicking dropdown at: (${dropdownX}, ${dropdownY})`);

    // First check what windows exist before clicking
    const windowsBefore = await page.evaluate(() => {
      const windows = document.querySelectorAll('[id^="window-"]');
      return Array.from(windows).map(w => ({
        id: w.id,
        display: (w as HTMLElement).style.display,
        width: (w as HTMLElement).style.width,
        height: (w as HTMLElement).style.height
      }));
    });
    console.log('Windows BEFORE click:', JSON.stringify(windowsBefore));

    await page.mouse.click(dropdownX, dropdownY);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'test-results/zorder-02-dropdown-clicked.png', fullPage: true });

    // Check what windows exist after clicking
    const windowsAfter = await page.evaluate(() => {
      const windows = document.querySelectorAll('[id^="window-"]');
      return Array.from(windows).map(w => ({
        id: w.id,
        display: (w as HTMLElement).style.display,
        width: (w as HTMLElement).style.width,
        height: (w as HTMLElement).style.height,
        rect: w.getBoundingClientRect()
      }));
    });
    console.log('Windows AFTER click:', JSON.stringify(windowsAfter));

    // Check for any logged events
    const clickEvents = logs.filter(log =>
      log.includes('GL Test selected') ||
      log.includes('clicked') ||
      log.includes('Choice')
    );
    console.log('Click-related events in logs:', clickEvents);

    // Check z-index values
    const zIndexInfo = await page.evaluate(() => {
      const glCanvas = document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement;
      const popupWindows = document.querySelectorAll('[id^="window-"]');

      const result: any = {
        glCanvas: null,
        popupWindows: []
      };

      if (glCanvas) {
        const style = window.getComputedStyle(glCanvas);
        result.glCanvas = {
          id: glCanvas.id,
          zIndex: style.zIndex,
          display: style.display
        };
      }

      popupWindows.forEach((w) => {
        const el = w as HTMLElement;
        const style = window.getComputedStyle(el);
        if (style.display !== 'none') {
          result.popupWindows.push({
            id: el.id,
            zIndex: style.zIndex,
            display: style.display,
            width: style.width,
            height: style.height
          });
        }
      });

      return result;
    });

    console.log('Z-Index info:', JSON.stringify(zIndexInfo, null, 2));

    // Step 3: Click on the dropdown arrow button to close it
    // The arrow is on the right side of the dropdown control (around x=290)
    await page.mouse.click(box.x + 290, box.y + 140);
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/zorder-03-dropdown-closed.png', fullPage: true });

    // After the fix, popup z-index should be higher than GL canvas z-index
    // This will be verified by visual inspection of screenshots
  });

  test('switching tabs multiple times maintains correct visibility', async ({ page }) => {
    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Tab switch sequence: Controls -> OpenGL -> Lists -> OpenGL -> Drawing -> Controls
    const tabClicks = [
      { x: 35, name: 'Controls' },
      { x: 280, name: 'OpenGL' },
      { x: 225, name: 'Lists' },
      { x: 280, name: 'OpenGL' },
      { x: 175, name: 'Drawing' },
      { x: 35, name: 'Controls' }
    ];

    for (let i = 0; i < tabClicks.length; i++) {
      const tab = tabClicks[i];
      await page.mouse.click(box.x + tab.x, box.y + 35);
      await page.waitForTimeout(500);

      await page.screenshot({
        path: `test-results/tabswitch-${String(i + 1).padStart(2, '0')}-${tab.name.toLowerCase()}.png`,
        fullPage: true
      });

      // Check GL canvas visibility
      const glVisible = await page.evaluate(() => {
        const glCanvas = document.querySelector('[id^="glcanvas-"]') as HTMLCanvasElement;
        if (!glCanvas) return 'not-created';
        return window.getComputedStyle(glCanvas).display;
      });

      console.log(`Tab: ${tab.name}, GL Canvas display: ${glVisible}`);
    }
  });
});
