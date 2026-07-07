// wxRadioButton group exclusivity tests.
//
// Regression coverage for the WASM DOM-port bug where every wxRadioButton got
// the same HTML `name` ("wxrb-", because `%p` rendered empty in wxString::Format),
// collapsing all radio groups in a window into one. The harness lays out three
// independent groups, each pre-selecting a different column, so a correct build
// keeps three distinct group `name`s with exactly one checked radio per group.
import { test, expect, waitForWxApp } from './utils/fixtures';
import { stableShot } from './utils/element-tracker';

const URL = '/standalone/radiogroups/radiogroups_test.html';

// Collect, per HTML radio group `name`, how many radios it has and how many are checked.
async function readGroups(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const radios = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type=radio]')
    ).filter(r => r.offsetParent !== null); // visible only

    const byName: Record<string, { total: number; checked: number }> = {};
    for (const r of radios) {
      (byName[r.name] ??= { total: 0, checked: 0 }).total++;
      if (r.checked) byName[r.name].checked++;
    }
    return {
      radioCount: radios.length,
      distinctNames: Array.from(new Set(radios.map(r => r.name))),
      byName,
      totalChecked: radios.filter(r => r.checked).length,
      details: radios.map((r, i) => ({ i, name: r.name, checked: r.checked })),
    };
  });
}

test.describe('wxRadioButton groups', () => {
  test('radio groups app loads without errors', async ({ page, testLogger }) => {
    await page.goto(URL);
    await waitForWxApp(page);
    await stableShot(page, 'radiogroups-01-loaded.png', { fullPage: true });
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('selecting in one group does not disturb the others', async ({ page }) => {
    await page.goto(URL);
    await waitForWxApp(page);

    // 3 groups x 4 columns = 12 radios.
    await page.waitForFunction(
      () => document.querySelectorAll('input[type=radio]').length >= 12,
      undefined,
      { timeout: 10_000 }
    );

    // Structural proof of the fix: three separate HTML exclusivity groups, not
    // one merged group. (Pre-fix every radio shares name "wxrb-" => length 1.)
    const before = await readGroups(page);
    expect(before.radioCount, 'should render 3 groups x 4 columns').toBe(12);
    expect(before.distinctNames,
      `expected 3 group names, got ${JSON.stringify(before.distinctNames)}`).toHaveLength(3);

    // Behavioural proof: click one radio in each group, on a different column.
    // Groups are contiguous in DOM order: A=0..3, B=4..7, C=8..11.
    const radios = page.locator('input[type=radio]');
    await radios.nth(1).click();  // Group A, Ctrl
    await radios.nth(6).click();  // Group B, Shift
    await radios.nth(11).click(); // Group C, Alt

    // Deterministically wait for the three clicks to settle into their groups
    // (replaces a blind 100ms dwell; the checked-radio set is the observable).
    await expect
      .poll(
        async () => (await readGroups(page)).details.filter(d => d.checked).map(d => d.i),
        { message: 'each click should register independently in its own group' }
      )
      .toEqual([1, 6, 11]);

    const after = await readGroups(page);
    await stableShot(page, 'radiogroups-02-selections.png', { fullPage: true });

    // Each group keeps exactly its own selection. Pre-fix, the three clicks land
    // in one merged group so only the last survives => totalChecked === 1.
    expect(after.totalChecked, 'one selection per group => 3 total').toBe(3);
    for (const [name, counts] of Object.entries(after.byName)) {
      expect(counts.checked, `group ${name} should keep exactly one checked`).toBe(1);
    }
    // Spot-check the exact radios we clicked are the ones checked.
    expect(after.details.filter(d => d.checked).map(d => d.i)).toEqual([1, 6, 11]);
  });
});
