import { test, expect, waitForApp } from './utils/fixtures';

// Port-agnostic boot check: the app starts, the wx element registry fills,
// and (in DOM mode) the wx-dom shim is present. Runs under both WX_PORT
// values; intentionally takes no screenshots.
test.describe('Application boot', () => {
  test('minimal app boots and registers elements', async ({ page, testLogger }) => {
    const fatal: string[] = [];
    page.on('pageerror', (err) => fatal.push(String(err)));

    await page.goto('/minimal_test.html');
    await waitForApp(page);

    // The registry fills as wx windows are created.
    await page.waitForFunction(
      () => (window as any).wxElementRegistry?.elements?.size > 0,
      undefined,
      { timeout: 30000 }
    );

    const elementCount = await page.evaluate(
      () => (window as any).wxElementRegistry.elements.size
    );
    expect(elementCount).toBeGreaterThan(0);

    const isDomPort = await page.evaluate(() => (window as any).wxDomPort === true);
    expect(isDomPort).toBe(process.env.WX_PORT === 'dom');

    expect(fatal, `page errors: ${fatal.join('\n')}`).toHaveLength(0);
  });
});
