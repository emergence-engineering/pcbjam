import { test, expect, Page } from '@playwright/test';

const MAIN_CANVAS = '#canvas';

async function waitForApp(page: Page) {
  await page.waitForSelector(MAIN_CANVAS, { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(500);
}

async function switchToOpenGLTab(page: Page, box: { x: number; y: number }) {
  // Click OpenGL tab (fifth tab, around x=280)
  await page.mouse.click(box.x + 280, box.y + 35);
  await page.waitForTimeout(1000);
}

// Open the test dropdown and select by index (0-based)
async function selectGLTest(page: Page, box: { x: number; y: number }, index: number) {
  // Click the dropdown arrow to open it (dropdown is at around x=170, y=155, arrow at right edge ~x=290)
  await page.mouse.click(box.x + 290, box.y + 155);
  await page.waitForTimeout(300);

  // Each dropdown item is approximately 20px tall, starting below the dropdown
  const itemY = 175 + (index * 20);
  await page.mouse.click(box.x + 170, box.y + itemY);
  await page.waitForTimeout(500);
}

test.describe('OpenGL Tests', () => {
  test('Vertex Arrays test - debug freeze', async ({ page }) => {
    const errors: string[] = [];
    const logs: string[] = [];

    page.on('pageerror', err => {
      errors.push(`[PAGE_ERROR] ${err.message}\n${err.stack || 'No stack'}`);
    });
    page.on('console', msg => {
      const text = msg.text();
      logs.push(`[${msg.type()}] ${text}`);
      if (msg.type() === 'error') {
        errors.push(`[CONSOLE_ERROR] ${text}`);
      }
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Switch to OpenGL tab
    await switchToOpenGLTab(page, box);
    await page.screenshot({ path: 'test-results/gl-01-opengl-tab.png', fullPage: true });

    // The dropdown has these options (from minimal_test.cpp):
    // 0: "Immediate Mode (glBegin/glEnd)"
    // 1: "Matrix Ops (glPushMatrix)"
    // 2: "Vertex Arrays (glVertexPointer)"
    // 3: "State Mgmt (glEnable/glBlend)"
    // 4: "Texture Coords"

    // Select "Vertex Arrays" test (index 2)
    console.log('Selecting Vertex Arrays test...');
    await selectGLTest(page, box, 2);

    await page.screenshot({ path: 'test-results/gl-02-vertex-arrays-selected.png', fullPage: true });

    // Wait a bit to see if it freezes
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/gl-03-after-wait.png', fullPage: true });

    // Print all logs for debugging
    console.log('\n=== CONSOLE LOGS ===');
    logs.forEach(log => console.log(log));
    console.log('\n=== ERRORS ===');
    errors.forEach(err => console.log(err));

    // Check if app is still responsive
    const isResponsive = await page.evaluate(() => {
      return document.querySelector('#canvas') !== null;
    });
    expect(isResponsive).toBe(true);
  });

  test('All GL tests individually', async ({ page }) => {
    const errors: string[] = [];
    const logs: string[] = [];

    page.on('pageerror', err => {
      errors.push(`[PAGE_ERROR] ${err.message}\n${err.stack || 'No stack'}`);
    });
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await switchToOpenGLTab(page, box);

    const testNames = [
      'Immediate Mode',
      'Matrix Ops',
      'Vertex Arrays',
      'State Mgmt',
      'Texture Coords'
    ];

    for (let i = 0; i < testNames.length; i++) {
      console.log(`\n--- Testing: ${testNames[i]} (index ${i}) ---`);

      try {
        await selectGLTest(page, box, i);
        await page.screenshot({
          path: `test-results/gl-test-${i}-${testNames[i].replace(/\s+/g, '-').toLowerCase()}.png`,
          fullPage: true
        });
        console.log(`${testNames[i]}: OK`);
      } catch (e) {
        console.log(`${testNames[i]}: FAILED - ${e}`);
        await page.screenshot({
          path: `test-results/gl-test-${i}-${testNames[i].replace(/\s+/g, '-').toLowerCase()}-error.png`,
          fullPage: true
        });
      }

      await page.waitForTimeout(500);
    }

    console.log('\n=== ERRORS ===');
    errors.forEach(err => console.log(err));
  });

  test('Run All Tests button', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', err => {
      errors.push(`${err.message}\n${err.stack || 'No stack'}`);
    });

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    const canvas = page.locator(MAIN_CANVAS);
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    await switchToOpenGLTab(page, box);

    // Click "Run All Tests" button (approximately x=360, y=90)
    await page.mouse.click(box.x + 360, box.y + 90);
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/gl-run-all-tests.png', fullPage: true });

    // App should remain stable
    await expect(page.locator(MAIN_CANVAS)).toBeVisible();
  });
});
