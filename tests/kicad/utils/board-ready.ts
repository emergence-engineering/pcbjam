import type { Page } from '@playwright/test';

/**
 * Wait for pcbnew to finish opening a board.
 *
 * Indicators we can rely on with the current wxwidgets-wasm registry:
 *   1. The wxFileDialog ("filedlg") that we used to pick the file disappears.
 *   2. The wxProgressDialog that KiCad pops up during LoadBoard appears and
 *      then disappears — this is the most reliable "load complete" signal
 *      because pcbnew's frame title is set via wxFrame::SetTitle, which the
 *      WASM registry currently does not capture.
 *
 * We accept two terminal states:
 *   - "loaded": progress dialog was seen and then went away while PcbFrame
 *     stays visible (the happy path).
 *   - "no-dialogs": no dialogs are visible after the open command — covers
 *     tiny boards where LoadBoard finishes before the progress dialog paints.
 *
 * Returns a string describing which path completed, for the test log.
 */
export async function waitForBoardLoaded(
    page: Page,
    logger: { consoleLogs: string[]; errors: string[] },
    timeoutMs = 60000,
): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let progressSeen = false;

    while (Date.now() < deadline) {
        // Surface a WASM abort fast — otherwise the progress dialog never
        // goes away and we'd burn the full timeout. KiCad logs the abort
        // line through Module.printErr, which our test logger captures as
        // a console error. We re-read the live arrays each tick.
        const allLines = [...logger.consoleLogs, ...logger.errors];
        const abort = allLines.find((l) =>
            l.includes('Aborted(') || l.includes('RuntimeError: unreachable')
        );
        if (abort) {
            throw new Error(`WASM aborted during LoadBoard:\n${abort}`);
        }

        const state = await page.evaluate(() => {
            const registry = window.wxElementRegistry;
            if (!registry) return { ready: false, dialogs: [] as string[], hasProgress: false, hasFileDlg: false };
            const dialogs = registry.findAll({ visible: true })
                .filter((el) => /Dialog/.test(el.typeName))
                .map((el) => el.typeName);
            const hasFileDlg = dialogs.includes('wxFileDialog');
            const hasProgress = dialogs.some((t) => /Progress/.test(t));
            const hasPcbFrame = registry.findAll({ visible: true })
                .some((el) => el.name === 'PcbFrame');
            return {
                ready: hasPcbFrame && !hasFileDlg && !hasProgress,
                dialogs,
                hasProgress,
                hasFileDlg,
            };
        });

        if (state.hasProgress) {
            progressSeen = true;
        }
        if (state.ready) {
            return progressSeen ? 'loaded (progress dialog observed)' : 'loaded (no progress dialog seen)';
        }

        await page.waitForTimeout(200);
    }

    throw new Error(`Timed out waiting for board to load after ${timeoutMs}ms`);
}
