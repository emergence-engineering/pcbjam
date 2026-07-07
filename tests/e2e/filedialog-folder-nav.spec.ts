// Regression coverage for the wxFileDialog folder-navigation fix
// (wxGenericFileDialog::OnOk now navigates into directories instead of
// closing the dialog with the folder path as a "file").
//
// Reproduces the original bug: select a folder, press Enter, expect the
// dialog to navigate into the folder rather than close.

import { test, expect, waitForWxApp, clickByLabel } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

test('folder navigation: Enter on a folder navigates instead of closing the dialog', async ({ page, testLogger }) => {
  await page.goto('/standalone/filedialog/filedialog_test.html');
  await waitForWxApp(page);

  await clickByLabel(page, 'Open File...');
  await page.waitForTimeout(800); // eslint-disable-line -- documented interaction dwell: let the file dialog open + take focus (no dialog-open event to observe)

  // Type a path that's a folder in Emscripten's MEMFS and press Enter.
  // Before the fix, OnOk treated /dev as a file → either showed "Please
  // choose an existing file" (wxFD_FILE_MUST_EXIST) or closed the dialog
  // and surfaced /dev to the calling app as if it were a file.
  await page.keyboard.type('/dev');
  await page.waitForTimeout(200); // eslint-disable-line -- documented interaction dwell: keystroke commit into the path field
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800); // eslint-disable-line -- documented interaction dwell: negative assertion — give OnOk time to (wrongly) emit the "Selected file:" event before asserting it did not

  await stableShot(page, 'filedlg-folder-nav.png', { fullPage: true });

  // No "Selected file:" log should appear — the dialog must NOT have closed
  // with /dev as the picked file.
  const closedWithDev = testLogger.consoleLogs.some(l =>
    l.includes('[FILEDIALOG_EVENT] Selected file:') && l.includes('/dev')
  );
  expect(closedWithDev, 'dialog must not close and report /dev as the selected file').toBe(false);
});
