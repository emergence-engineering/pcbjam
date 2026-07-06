import { test, expect, type Page } from '@playwright/test';

/**
 * Figma-like comments e2e (collab-presence 0005): two tabs of the real React
 * app on the SAME schematic share the comments map in the per-file Y.Doc.
 * Flow: alice pins a comment via comment mode → bob sees the pin, opens the
 * thread, replies → alice sees the reply live → resolve → delete clears both.
 *
 * Uses eeschema (demo.kicad_sch — the comment bridge ships in the merged
 * kicad_editor bundle, so pcbnew/eeschema only; pl_editor has no pins).
 * The GAL dot is drawn by the wasm; the assertions here drive the DOM halves
 * (hit targets, composer, popover) which is what this layer owns.
 */

const SCOPE = 'default';
const ROUTE = 'demo.kicad_sch';
const TITLE = /demo — Schematic Editor/i;

async function bootAs(page: Page, user: string): Promise<void> {
  await page.goto(`/${SCOPE}/projects/demo/${ROUTE}?user=${user}`);
  await expect(page.locator('#canvas')).toBeVisible({ timeout: 120000 });
  await expect
    .poll(() => page.title(), {
      message: `${user}: editor never reached the expected title`,
      timeout: 120000,
      intervals: [1000],
    })
    .toMatch(TITLE);
  // The comment controls mount once the collab session + bridge are up.
  await expect(page.getByTestId('comment-mode-toggle')).toBeVisible({ timeout: 30000 });
}

/** Delete every leftover thread from previous runs — comments PERSIST in the
 *  room's ydoc (that's the feature), so the spec must start from a clean slate.
 *  Uses the controller's test handle; the UI delete path is covered below. */
async function deleteAllThreads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ctl = (window as unknown as {
      __pcbjamComments?: {
        threads(): Array<{ id: string }>;
        deleteThread(id: string): void;
      };
    }).__pcbjamComments;
    ctl?.threads().forEach((t) => ctl.deleteThread(t.id));
  });
  await expect(page.getByTestId('comment-pin')).toHaveCount(0);
}

test('comment lifecycle across two tabs: create → reply → resolve → delete', async ({
  page,
  context,
}) => {
  test.setTimeout(360000); // two full tool boots

  await bootAs(page, 'alice');
  await deleteAllThreads(page);
  const pageB = await context.newPage();
  await bootAs(pageB, 'bob');

  // ── create (alice): comment mode → click the canvas → composer → submit ──
  await page.getByTestId('comment-mode-toggle').click();
  const catcher = page.getByTestId('comment-click-catcher');
  await expect(catcher).toBeVisible();
  await catcher.click({ position: { x: 400, y: 250 } });

  const composer = page.getByTestId('comment-composer');
  await expect(composer).toBeVisible();
  await composer.locator('textarea').fill('check this net');
  await page.getByTestId('comment-submit').click();

  // The thread popover opens on the fresh pin; the pin target exists.
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await expect(page.getByTestId('comment-pin')).toHaveCount(1);

  // ── bob sees the pin live, opens it, reads alice, replies ──
  await expect(pageB.getByTestId('comment-pin')).toHaveCount(1, { timeout: 20000 });
  await pageB.getByTestId('comment-pin').click();
  await expect(pageB.getByTestId('comment-popover')).toBeVisible();
  await expect(pageB.getByTestId('comment-message')).toContainText('check this net');

  await pageB.getByTestId('comment-reply').fill('will fix');
  await pageB.getByTestId('comment-reply').press('Enter');

  // ── alice sees the reply live in her open popover ──
  await expect(page.getByTestId('comment-message')).toHaveCount(2, { timeout: 20000 });
  await expect(page.getByTestId('comment-message').nth(1)).toContainText('will fix');

  // ── resolve (alice) → bob's popover flips to resolved ──
  await page.getByTestId('comment-resolve').click();
  await expect(pageB.getByTestId('comment-popover')).toContainText('resolved', {
    timeout: 20000,
  });

  // Resolved pins hide from the default (unresolved) pin set in both tabs…
  await expect(page.getByTestId('comment-pin')).toHaveCount(0, { timeout: 20000 });
  // …but stay reachable via the panel's "resolved" filter.
  await page.getByTestId('comment-panel-toggle').click();
  await page.getByTestId('comment-show-resolved').check();
  await expect(page.getByTestId('comment-panel-item')).toHaveCount(1);

  // ── delete (alice, thread author) clears the pin everywhere ──
  await page.getByTestId('comment-panel-item').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-delete-thread').click();

  await expect(page.getByTestId('comment-panel-item')).toHaveCount(0, { timeout: 20000 });
  await expect(pageB.getByTestId('comment-pin')).toHaveCount(0, { timeout: 20000 });
  await pageB.close();
});
