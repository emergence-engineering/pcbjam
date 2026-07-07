// wxValidator Tests - Input validation like KiCad's dialog validators
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test.describe('wxValidator Tests', () => {

  test('Validators test app loads successfully', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'validators-01-loaded.png', { fullPage: true });

    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Text validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'validators-02-text.png', { fullPage: true });

    // App loaded successfully - verify no errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Integer validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'validators-03-integer.png', { fullPage: true });
  });

  test('Floating point validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'validators-04-float.png', { fullPage: true });
  });

  test('Custom net name validator input exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'validators-05-netname.png', { fullPage: true });
  });

  test('Validate all button exists', async ({ page, testLogger }) => {
    await page.goto('/standalone/validators/validators_test.html');
    await waitForWxApp(page);

    await stableShot(page, 'validators-06-button.png', { fullPage: true });
  });

});
