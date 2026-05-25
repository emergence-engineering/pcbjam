import { test, expect, tryLoadApp } from './utils/fixtures';

// Isolated reproduction probe for the KiCad Asyncify-fiber x pthreads Chrome crash.
// Loads main_repro.html (fiber Call/Yield/Resume in main(), built WITH pthreads, no wx).
// Firefox should print "[REPRO] DONE"; if system Chrome crashes before DONE, the crash
// is reproduced in isolation.
test.describe('Coroutine pthread main() reproduction', () => {
  test('fiber-in-main + pthreads reaches DONE without renderer crash', async ({ page, testLogger }) => {
    await page.goto('/standalone/coroutine-pthread/main_repro.html');
    await tryLoadApp(page, 20000).catch(() => {});

    await expect
      .poll(() => testLogger.consoleLogs.some((l) => l.includes('[REPRO] DONE')), {
        timeout: 30000,
        message: 'should reach [REPRO] DONE (i.e. the main-context rewind survived)',
      })
      .toBe(true);

    // Sanity: the coroutine body must actually have run (fiber entry wired up).
    expect(
      testLogger.consoleLogs.some((l) => l.includes('[REPRO] coroutine body running')),
      'coroutine body should have executed'
    ).toBe(true);
  });

  // Probe #2: coroutine activated through nested JS<->wasm dynCall boundaries (KiCad's shape).
  test('nested dynCall-boundary fiber reaches DONE without renderer crash', async ({ page, testLogger }) => {
    await page.goto('/standalone/coroutine-pthread/nested_repro_ex.html');
    await tryLoadApp(page, 20000).catch(() => {});

    await expect
      .poll(() => testLogger.consoleLogs.some((l) => l.includes('[REPRO] DONE')), {
        timeout: 30000,
        message: 'should reach [REPRO] DONE (main rewind through the dynCall chain survived)',
      })
      .toBe(true);

    expect(
      testLogger.consoleLogs.some((l) => l.includes('[REPRO] coroutine body running')),
      'coroutine body should have executed'
    ).toBe(true);
  });

  // Probe #3: the full 13-scenario wx-event-loop harness, built WITH pthreads.
  test('wx event loop + pthreads coroutine suite completes without renderer crash', async ({ page, testLogger }) => {
    await page.goto('/standalone/coroutine-pthread/coroutine_test_wxpt.html');
    await tryLoadApp(page, 30000).catch(() => {});

    await expect
      .poll(() => testLogger.consoleLogs.find((l) => l.includes('[COROUTINE_TEST] SUMMARY')) ?? null, {
        timeout: 45000,
        message: 'wx+pthreads suite should emit a SUMMARY line (no crash)',
      })
      .not.toBeNull();

    const summary = testLogger.consoleLogs.find((l) => l.includes('[COROUTINE_TEST] SUMMARY'))!;
    const m = summary.match(/total=(\d+)\s+passed=(\d+)\s+failed=(\d+)/);
    expect(m, 'SUMMARY parseable').not.toBeNull();
    expect(Number(m![3]), 'no failed cases').toBe(0);
  });

  // Probe #4: coroutine activated via an embind (--bind) call.
  test('embind-activated fiber reaches DONE without renderer crash', async ({ page, testLogger }) => {
    await page.goto('/standalone/coroutine-pthread/embind_repro.html');
    await tryLoadApp(page, 20000).catch(() => {});

    await expect
      .poll(() => testLogger.consoleLogs.some((l) => l.includes('[REPRO] DONE')), {
        timeout: 30000,
        message: 'should reach [REPRO] DONE (rewind through the embind dispatch survived)',
      })
      .toBe(true);

    expect(
      testLogger.consoleLogs.some((l) => l.includes('ToolHost::activate')),
      'embind activate should have run'
    ).toBe(true);
  });

  // Probe #5: coroutine activated inside an emscripten_set_main_loop (rAF) callback
  // (the single JS->wasm boundary KiCad uses; matches "main-refresh" in the crash trace).
  test('main-loop(rAF)-activated fiber reaches DONE without renderer crash', async ({ page, testLogger }) => {
    await page.goto('/standalone/coroutine-pthread/mainloop_repro.html');
    await tryLoadApp(page, 20000).catch(() => {});

    await expect
      .poll(() => testLogger.consoleLogs.some((l) => l.includes('[REPRO] DONE')), {
        timeout: 30000,
        message: 'should reach [REPRO] DONE (rewind through the main-loop dynCall_v survived)',
      })
      .toBe(true);

    expect(
      testLogger.consoleLogs.some((l) => l.includes('activating coroutine inside main-loop refresh')),
      'main loop should have run and activated the coroutine'
    ).toBe(true);
  });
});
