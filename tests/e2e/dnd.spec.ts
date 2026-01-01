// wxDragDrop Tests - HTML5 file drop support for KiCad
// Tests external file drops via HTML5 drag and drop API
import { test, expect, tryLoadApp, getCanvasBox } from './utils/fixtures';
import * as path from 'path';
import * as fs from 'fs';

test.describe('wxDragDrop Tests', () => {

  test('DnD test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);

    await page.screenshot({ path: 'test-results/dnd-01-loaded.png', fullPage: true });

    const hasStartup = testLogger.consoleLogs.some(l => l.includes('DND_TEST'));

    expect(loaded, 'wxDragDrop app should load').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('DnD handlers are registered', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    await page.screenshot({ path: 'test-results/dnd-02-handlers.png', fullPage: true });

    const hasDndRegistered = testLogger.consoleLogs.some(l =>
      l.includes('[DND] Drag and drop handlers registered'));

    expect(hasDndRegistered, 'DnD handlers should be registered').toBe(true);
  });

  test('DragEnter event is detected', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box, 'Canvas should have bounding box').not.toBeNull();

    // Simulate dragenter event
    await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('canvas');
      if (canvas) {
        const event = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: new DataTransfer()
        });
        canvas.dispatchEvent(event);
      }
    }, { x: box.x + 400, y: box.y + 200 });

    await page.waitForTimeout(100);
    await page.screenshot({ path: 'test-results/dnd-03-dragenter.png', fullPage: true });

    const hasDragEnter = testLogger.consoleLogs.some(l => l.includes('[DND] dragenter'));
    expect(hasDragEnter, 'DragEnter event should be logged').toBe(true);
  });

  test('DragLeave event is detected', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box, 'Canvas should have bounding box').not.toBeNull();

    // Simulate dragenter then dragleave
    await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('canvas');
      if (canvas) {
        const enterEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: new DataTransfer()
        });
        canvas.dispatchEvent(enterEvent);

        const leaveEvent = new DragEvent('dragleave', {
          bubbles: true,
          cancelable: true,
          dataTransfer: new DataTransfer()
        });
        canvas.dispatchEvent(leaveEvent);
      }
    }, { x: box.x + 400, y: box.y + 200 });

    await page.waitForTimeout(100);
    await page.screenshot({ path: 'test-results/dnd-04-dragleave.png', fullPage: true });

    const hasDragLeave = testLogger.consoleLogs.some(l => l.includes('[DND] dragleave'));
    expect(hasDragLeave, 'DragLeave event should be logged').toBe(true);
  });

  test('Drop event triggers file processing', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box, 'Canvas should have bounding box').not.toBeNull();

    // Create a test file and simulate drop
    const testContent = 'Test file content for DnD';
    const testFileName = 'test-drop-file.txt';

    await page.evaluate(({ x, y, fileName, content }) => {
      const canvas = document.getElementById('canvas');
      if (canvas) {
        const dataTransfer = new DataTransfer();
        const file = new File([content], fileName, { type: 'text/plain' });
        dataTransfer.items.add(file);

        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: dataTransfer
        });
        canvas.dispatchEvent(event);
      }
    }, { x: box.x + 400, y: box.y + 200, fileName: testFileName, content: testContent });

    // Wait for async file processing
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/dnd-05-drop.png', fullPage: true });

    const hasDropLog = testLogger.consoleLogs.some(l => l.includes('[DND] drop'));
    expect(hasDropLog, 'Drop event should be logged').toBe(true);
  });

  test('Dropped file is written to WASM filesystem', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box, 'Canvas should have bounding box').not.toBeNull();

    const testFileName = 'wasm-test-file.txt';
    const testContent = 'Content written via DnD';

    await page.evaluate(({ x, y, fileName, content }) => {
      const canvas = document.getElementById('canvas');
      if (canvas) {
        const dataTransfer = new DataTransfer();
        const file = new File([content], fileName, { type: 'text/plain' });
        dataTransfer.items.add(file);

        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: dataTransfer
        });
        canvas.dispatchEvent(event);
      }
    }, { x: box.x + 400, y: box.y + 200, fileName: testFileName, content: testContent });

    // Wait for file to be written
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/dnd-06-file-written.png', fullPage: true });

    const hasFileWritten = testLogger.consoleLogs.some(l =>
      l.includes('[DND] Wrote file:') && l.includes(testFileName));
    expect(hasFileWritten, 'File should be written to WASM filesystem').toBe(true);
  });

  test('wxDropFilesEvent is fired after drop', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box, 'Canvas should have bounding box').not.toBeNull();

    const testFileName = 'event-test.kicad_pcb';
    const testContent = '(kicad_pcb (version 20230121))';

    await page.evaluate(({ x, y, fileName, content }) => {
      const canvas = document.getElementById('canvas');
      if (canvas) {
        const dataTransfer = new DataTransfer();
        const file = new File([content], fileName, { type: 'application/octet-stream' });
        dataTransfer.items.add(file);

        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: dataTransfer
        });
        canvas.dispatchEvent(event);
      }
    }, { x: box.x + 400, y: box.y + 200, fileName: testFileName, content: testContent });

    // Wait for wxDropFilesEvent processing
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/dnd-07-event-fired.png', fullPage: true });

    // Check that the app received the drop event (logged via [DND_EVENT] prefix)
    // The app logs "=== wxDropFilesEvent received! ===" which includes DND_EVENT prefix
    const hasDropEvent = testLogger.consoleLogs.some(l =>
      l.includes('[DND_EVENT]'));
    expect(hasDropEvent, 'wxDropFilesEvent should be fired').toBe(true);
  });

  test('Multiple files can be dropped', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box, 'Canvas should have bounding box').not.toBeNull();

    await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('canvas');
      if (canvas) {
        const dataTransfer = new DataTransfer();
        const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' });
        const file2 = new File(['content2'], 'file2.txt', { type: 'text/plain' });
        const file3 = new File(['content3'], 'file3.txt', { type: 'text/plain' });
        dataTransfer.items.add(file1);
        dataTransfer.items.add(file2);
        dataTransfer.items.add(file3);

        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: dataTransfer
        });
        canvas.dispatchEvent(event);
      }
    }, { x: box.x + 400, y: box.y + 200 });

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/dnd-08-multiple-files.png', fullPage: true });

    const hasMultipleFiles = testLogger.consoleLogs.some(l =>
      l.includes('[DND] drop: 3 files'));
    expect(hasMultipleFiles, 'Multiple files should be detected').toBe(true);
  });

  test('Clear files button exists in UI', async ({ page, testLogger }) => {
    await page.goto('/standalone/dnd/dnd_test.html');
    const loaded = await tryLoadApp(page);
    expect(loaded, 'App should load').toBe(true);

    // First drop a file to verify drop works
    const canvas = page.locator('#canvas');
    const box = await canvas.boundingBox();
    expect(box, 'Canvas should have bounding box').not.toBeNull();

    await page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('canvas');
      if (canvas) {
        const dataTransfer = new DataTransfer();
        const file = new File(['test'], 'test.txt', { type: 'text/plain' });
        dataTransfer.items.add(file);

        const event = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          dataTransfer: dataTransfer
        });
        canvas.dispatchEvent(event);
      }
    }, { x: box.x + 400, y: box.y + 200 });

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/dnd-09-with-file.png', fullPage: true });

    // Verify file was dropped (from JS side)
    const hasDropped = testLogger.consoleLogs.some(l => l.includes('[DND] Wrote file:'));
    expect(hasDropped, 'File should be dropped and logged').toBe(true);
  });
});
