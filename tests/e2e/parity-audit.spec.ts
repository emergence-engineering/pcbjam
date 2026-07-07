import { test, expect, tryLoadApp } from './utils/fixtures';

// Red-green reproductions for wxWidgets DOM-port vs native (wxGTK) parity gaps
// found in the parity audit. Each standalone app
// (tests/apps/standalone/<name>/) drives the exact buggy path and self-reports a
// "[REPRO] <name>: PASS/FAIL" line (or exposes live DOM state); the test is RED
// while the bug is present and GREEN after the wasm-layer fix.

// Find the "[REPRO] <name>: ..." line emitted by a repro app.
function reproLine(logs: string[], name: string): string | undefined {
  return logs.find((l) => l.includes(`[REPRO] ${name}:`));
}

async function waitReady(testLogger: { consoleLogs: string[] }, marker: string) {
  await expect
    .poll(() => testLogger.consoleLogs.some((l) => l.includes(marker)), {
      timeout: 30000,
      message: `repro app should emit "${marker}"`,
    })
    .toBe(true);
}

test.describe('wxWidgets DOM-port parity reproductions', () => {
  // C-1 (Critical): wxEVT_CHOICE/LISTBOX/COMBOBOX are hand-rolled and never call
  // InitCommandEventWithItems(), so event.GetClientObject() is always NULL even
  // when the item was appended WITH client data. KiCad's Track & Via Properties
  // dialog static_cast<VIA_DIMENSION*>(aEvent.GetClientData())->... then traps
  // the WASM module on a normal selection. The app appends typed client data and
  // the handler checks the event carries it.
  test('selection events carry per-item client data (choice/listbox/combobox)', async ({
    page,
    testLogger,
  }) => {
    await page.goto('/standalone/selevent-clientdata/selevent-clientdata_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] selevent ready');

    // wxChoice -> <select> (single): pick "Beta" (index 1, client data DATA_B).
    await page.locator('select:not([multiple])').first().selectOption({ index: 1 });
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'choice_clientdata') ?? '', {
        timeout: 10000,
        message: 'wxChoice selection event must carry the item client object',
      })
      .toContain('PASS');

    // wxListBox -> <select multiple>: pick index 1.
    await page.locator('select[multiple]').first().selectOption({ index: 1 });
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'listbox_clientdata') ?? '', {
        timeout: 10000,
        message: 'wxListBox selection event must carry the item client object',
      })
      .toContain('PASS');

    // wxComboBox -> <input list=...>: commit "Beta" (index 1).
    const combo = page.locator('input[list]').first();
    await combo.fill('Beta');
    await combo.dispatchEvent('change');
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'combobox_clientdata') ?? '', {
        timeout: 10000,
        message: 'wxComboBox selection event must carry the item client object',
      })
      .toContain('PASS');
  });

  // H-4 (High): wxTextCtrl does not override Remove(), so Clear() (=Remove(0,-1))
  // and Remove() update only the C++ cache and leave the <input> showing the old
  // text. The app sets "hello world"; buttons drive Remove(1,5) then Clear().
  test('wxTextCtrl Clear()/Remove() update the visible <input>', async ({ page, testLogger }) => {
    await page.goto('/standalone/textctrl-clear/textctrl-clear_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] textctrl-clear ready');

    const input = page.locator('input').first();
    await expect
      .poll(async () => await input.inputValue(), { timeout: 10000 })
      .toBe('hello world');

    // Remove(1,5): "hello world" -> "h world".
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect
      .poll(async () => await input.inputValue(), {
        timeout: 10000,
        message: 'Remove() must update the <input>',
      })
      .toBe('h world');

    // Clear(): -> "".
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect
      .poll(async () => await input.inputValue(), {
        timeout: 10000,
        message: 'Clear() must empty the <input>',
      })
      .toBe('');
  });

  // H-5 (High): wxCheckListBox check marks are wiped on every item-list rebuild
  // (Append re-pushes only m_itemsSelected, never m_itemsChecked). The app
  // appends 5 rows and checks the even ones (0,2,4) with the Append-then-Check
  // pattern; before the fix only the last-checked row survives in the DOM.
  test('wxCheckListBox check marks survive item-list rebuilds', async ({ page, testLogger }) => {
    await page.goto('/standalone/checklist-checks/checklist-checks_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] checklist ready');

    const boxes = page.locator('[data-wx-check-list] input[type=checkbox]');
    await expect.poll(async () => await boxes.count(), { timeout: 10000 }).toBe(5);

    const expected = [true, false, true, false, true]; // checked evens
    await expect
      .poll(
        async () => {
          const states: boolean[] = [];
          for (let i = 0; i < 5; i++) states.push(await boxes.nth(i).isChecked());
          return JSON.stringify(states);
        },
        {
          timeout: 10000,
          message: 'rows 0,2,4 must be checked; 1,3 unchecked',
        },
      )
      .toBe(JSON.stringify(expected));
  });

  // H-6 (High): wxSlider fires only wxEVT_SLIDER, never the wxEVT_SCROLL_* family
  // — so KiCad's colour-picker brightness/alpha sliders (bound exclusively to
  // wxEVT_SCROLL_*) do nothing. The app binds only the scroll family; the spec
  // drives the real <input type=range>.
  test('wxSlider fires the wxEVT_SCROLL_* family on drag', async ({ page, testLogger }) => {
    await page.goto('/standalone/slider-scroll/slider-scroll_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] slider ready');

    const slider = page.locator('input[type=range]').first();
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '70';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // The scroll family must fire with the dragged value (RED before the fix).
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'slider_thumbtrack') ?? '', {
        timeout: 10000,
        message: 'wxEVT_SCROLL_THUMBTRACK must fire with the slider value',
      })
      .toContain('slider_thumbtrack: 70');
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'slider_changed') ?? '', {
        timeout: 10000,
        message: 'wxEVT_SCROLL_CHANGED must fire',
      })
      .toContain('slider_changed: 70');
  });

  // H-9 (High): wxConfig read-back truncates non-ASCII at the first multi-byte
  // char (getConfigEntryLength/getConfigKeyLength return UTF-16 code-unit count,
  // used as a UTF-8 byte budget). The app writes a non-ASCII value and entry
  // name and reads them back in-session.
  test('wxConfig round-trips non-ASCII strings without truncation', async ({ page, testLogger }) => {
    await page.goto('/standalone/config-utf8/config-utf8_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] config ready');

    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'config_value') ?? '', {
        timeout: 10000,
        message: 'non-ASCII config value must round-trip intact',
      })
      .toContain('PASS');
    await expect
      .poll(() => reproLine(testLogger.consoleLogs, 'config_keyname') ?? '', {
        timeout: 10000,
        message: 'non-ASCII config entry name must round-trip intact',
      })
      .toContain('PASS');
  });

  // #36 (Medium): wxStaticText pushes its label to the DOM verbatim, so a wx
  // mnemonic '&' renders literally. Native ports consume it ("&File" -> "File",
  // "&&" -> "&"). The app renders "&Layer && Net".
  test('wxStaticText consumes the mnemonic ampersand', async ({ page, testLogger }) => {
    await page.goto('/standalone/stattext-mnemonic/stattext-mnemonic_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] stattext-mnemonic ready');

    // wxStaticText -> <span>; it is the only span in this app.
    await expect
      .poll(async () => (await page.locator('span').first().textContent()) ?? '', {
        timeout: 10000,
        message: 'the rendered label must have the mnemonic & removed and && collapsed',
      })
      .toBe('Layer & Net');
  });

  // H-3/#30 (High): wxTextEntry caret/selection is a pure C++ cache. READ: the
  // accessors never consult the DOM input's selectionStart/End, and every DOM
  // "input" event resets the cached caret to 0 — so GetInsertionPoint()/
  // GetSelection() report 0/(0,0) regardless of the real caret. WRITE:
  // SetSelection()/SelectAll() never call setSelectionRange(), so programmatic
  // selection (KiCad's select-all-on-dialog-open) is invisible in the DOM.
  // The app reports the C++ view on demand and offers SetSelection buttons.
  test('wxTextEntry caret/selection is live against the DOM input', async ({ page, testLogger }) => {
    await page.goto('/standalone/textsel/textsel_test.html');
    expect(await tryLoadApp(page, 30000), 'repro app should load').toBe(true);
    await waitReady(testLogger, '[REPRO] textsel ready');

    const input = page.locator('input').first();
    await expect.poll(async () => input.inputValue(), { timeout: 10000 }).toBe('hello world');

    const stateLines = () =>
      testLogger.consoleLogs.filter((l) => l.includes('[REPRO] textsel state:'));

    // READ half (H-3), user selection: put a real selection on the DOM input,
    // then ask C++ what it sees.
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(4, 9));
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await expect
      .poll(() => stateLines()[0] ?? '', {
        timeout: 10000,
        message: 'GetInsertionPoint/GetSelection must reflect the live DOM selection (4,9)',
      })
      .toContain('insertion=4 sel=4,9');

    // READ half (H-3), typed caret: type at the end — the DOM caret is at 12,
    // while the buggy cache is reset to 0 by the input event.
    await input.click();
    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(11, 11));
    await input.pressSequentially('!');
    await expect.poll(async () => input.inputValue(), { timeout: 10000 }).toBe('hello world!');
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await expect
      .poll(() => stateLines()[1] ?? '', {
        timeout: 10000,
        message: 'GetInsertionPoint must track the DOM caret after typing (12)',
      })
      .toContain('insertion=12 sel=12,12');

    // WRITE half (#30): programmatic SetSelection/SelectAll must reach the DOM.
    // Mirror KiCad's real order (dialog_shim select-all runs while the field is
    // unfocused, then the dialog focuses it): set selection via the button
    // (which blurs the input to itself), then focus the input and read — the
    // selection must survive the focus, which is what makes type-to-replace work.
    const focusAndReadSelection = () =>
      input.evaluate((el: HTMLInputElement) => {
        el.focus();
        return [el.selectionStart, el.selectionEnd];
      });

    await page.getByRole('button', { name: 'Select Middle', exact: true }).click();
    await expect
      .poll(focusAndReadSelection, {
        timeout: 10000,
        message: 'SetSelection(2,7) must set a DOM selection that survives focus',
      })
      .toEqual([2, 7]);

    await page.getByRole('button', { name: 'Select All', exact: true }).click();
    await expect
      .poll(focusAndReadSelection, {
        timeout: 10000,
        message: 'SelectAll() must select the whole DOM value',
      })
      .toEqual([0, 12]);
  });
});
