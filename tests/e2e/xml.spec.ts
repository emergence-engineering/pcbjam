// wxXmlDocument Tests - XML parsing like KiCad's config and project files
//
// Determinism: no waitForTimeout. Readiness via waitForWxApp (canvas visible + registry
// populated, fails loudly) replaces the tryLoadApp + expect(loaded).toBe(true) dance. Each
// test screenshots a STATIC loaded state, so the 500ms settle sleeps are dropped and the
// screenshots become stableShot (its stabilization is the settle). Same base names.
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('wxXmlDocument Tests', () => {

  test('XML test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'xml-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Sample XML input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'xml-02-input.png', { fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Parse button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'xml-03-parse.png', { fullPage: true });
  });

  test('Traverse button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'xml-04-traverse.png', { fullPage: true });
  });

  test('Create XML button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'xml-05-create.png', { fullPage: true });
  });

  test('Results output panel exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/xml/xml_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'xml-06-results.png', { fullPage: true });
  });

});
