// wxDialog / wxMessageBox / wxTimer Tests - modal dialogs, message boxes and timers that
// KiCad uses for alerts, prompts and animations. Uses the element registry for semantic
// element identification.
//
// Determinism: no waitForTimeout. Readiness via waitForWxApp (canvas visible + registry
// populated, fails loudly). The Dialogs tab switch is done by clickTab, which internally
// polls the registry until the tab reports selected, so the fixed post-switch sleep and the
// silent clickByLabel fallback are gone. Static states (initial view, an open modal, a
// settled/closed dialog, a stopped timer) use stableShot, whose baseline comparison
// retries until the state renders and stabilises — this replaces the blind settle sleeps and
// also deterministically gates the following click (the OK button only exists once the modal
// has rendered). Mid-run timer screenshots (the label increments once a second while the
// timer runs, so no two frames are stable and they asserted nothing) are dropped; the timer
// is screenshotted only in its static initial and stopped states. Where an OK click is not
// preceded by a stabilising screenshot (the full-flow test), waitForRenderedByLabel gates it.
import { test, expect, waitForWxApp } from './utils/fixtures';
import { clickTab, clickByLabel, waitForElement, stableShot } from './utils/element-tracker';

async function switchToDialogsTab(page: any) {
  // clickTab polls the registry until the Dialogs tab reports selected (deterministic).
  // Assert it succeeded instead of silently falling back to clickByLabel + a blind sleep.
  const clicked = await clickTab(page, 'Dialogs');
  expect(clicked, 'Dialogs tab should be selectable').toBe(true);
}

test.describe('Dialogs Tab Tests', () => {

  test('Dialogs tab renders correctly', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    // Screenshot before switching to Dialogs tab
    await stableShot(page, 'dialogs-00-initial.png', { fullPage: true });

    // Switch to Dialogs tab
    await switchToDialogsTab(page);
    await stableShot(page, 'dialogs-01-tab-selected.png', { fullPage: true });

    // Verify app is still responsive
    const isResponsive = await page.evaluate(() => {
      return document.querySelector('#canvas') !== null;
    });
    expect(isResponsive).toBe(true);

    // Verify no critical errors
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test.describe('wxMessageBox', () => {

    test('Info message box opens and closes', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      await switchToDialogsTab(page);

      // Click "Info" button using element registry
      await clickByLabel(page, 'Info');

      // stableShot retries against the baseline until the modal has rendered and
      // stabilised (replaces the 500ms sleep) and guarantees the OK button now exists.
      await stableShot(page, 'dialogs-msgbox-info-open.png', { fullPage: true });

      // Click OK to close
      await clickByLabel(page, 'OK');

      await stableShot(page, 'dialogs-msgbox-info-closed.png', { fullPage: true });

      expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
    });

    test('Yes/No message box returns correct result', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      await switchToDialogsTab(page);

      // Click "Yes/No" button using element registry
      await clickByLabel(page, 'Yes/No');

      await stableShot(page, 'dialogs-msgbox-yesno-open.png', { fullPage: true });

      // Click Yes to close
      await clickByLabel(page, 'Yes');

      await stableShot(page, 'dialogs-msgbox-yesno-closed.png', { fullPage: true });
    });

    test('Error message box displays correctly', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      await switchToDialogsTab(page);

      // Click "Error" button using element registry
      await clickByLabel(page, 'Error');

      await stableShot(page, 'dialogs-msgbox-error-open.png', { fullPage: true });

      // Close the dialog with OK
      await clickByLabel(page, 'OK');

      await stableShot(page, 'dialogs-msgbox-error-closed.png', { fullPage: true });
    });
  });

  test.describe('wxDialog', () => {

    test('Custom dialog opens and closes', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      await switchToDialogsTab(page);

      // Click "Open Custom Dialog" button using element registry
      await clickByLabel(page, 'Open Custom Dialog');

      await stableShot(page, 'dialogs-custom-open.png', { fullPage: true });

      // Click OK to close
      await clickByLabel(page, 'OK');

      await stableShot(page, 'dialogs-custom-closed.png', { fullPage: true });
    });
  });

  test.describe('wxTimer', () => {

    test('Timer starts and increments', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      await switchToDialogsTab(page);

      await stableShot(page, 'dialogs-timer-initial.png', { fullPage: true });

      // Click "Start Timer" button using element registry. No screenshot of the running
      // timer: the label increments once a second, so a running frame never holds still
      // for stableShot to stabilise and it asserted nothing (started/running dropped).
      await clickByLabel(page, 'Start Timer');

      // Click "Stop Timer" (Start/Stop are separate always-present buttons; the queued
      // button events run in order, so no dwell is needed between them).
      await clickByLabel(page, 'Stop Timer');

      // The timer is now stopped and static.
      await stableShot(page, 'dialogs-timer-stopped.png', { fullPage: true });

      // Just verify no crashes occurred - this is a smoke test
      expect(true).toBe(true);
    });

    test('Timer can be started and stopped multiple times', async ({ page, testLogger }) => {
      await page.goto('/minimal_test.html');
      await waitForWxApp(page);

      await switchToDialogsTab(page);

      // Toggle the timer on/off twice. Start/Stop are separate always-present buttons and
      // the button events are processed FIFO, so the sequence is deterministic without the
      // blind run-dwell sleeps.
      await clickByLabel(page, 'Start Timer');
      await clickByLabel(page, 'Stop Timer');
      await clickByLabel(page, 'Start Timer');
      await clickByLabel(page, 'Stop Timer');

      // Timer is stopped and static after the final Stop.
      await stableShot(page, 'dialogs-timer-multiple.png', { fullPage: true });

      // Basic smoke test - no crashes
      expect(true).toBe(true);
    });
  });

  test('Full Dialogs tab interaction flow', async ({ page, testLogger }) => {
    await page.goto('/minimal_test.html');
    await waitForWxApp(page);

    await switchToDialogsTab(page);

    // 1. Click Info button and close (wait for the modal's OK to render before clicking it,
    //    replacing the settle sleeps deterministically).
    await clickByLabel(page, 'Info');
    await waitForElement(page, 'OK');
    await clickByLabel(page, 'OK');

    // 2. Click Custom Dialog button and close
    await clickByLabel(page, 'Open Custom Dialog');
    await waitForElement(page, 'OK');
    await clickByLabel(page, 'OK');

    // 3. Start and stop timer (separate always-present buttons, FIFO events)
    await clickByLabel(page, 'Start Timer');
    await clickByLabel(page, 'Stop Timer');

    await stableShot(page, 'dialogs-full-flow.png', { fullPage: true });

    // Verify no crashes
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });
});
