import { test, expect, tryLoadApp } from './utils/fixtures';

test.describe('Thread Pool Deadlock Tests', () => {

  test('Creating hardware_concurrency threads should not deadlock', async ({ page, testLogger }) => {
    // This test replicates KiCad's BS::priority_thread_pool pattern:
    // - Creates hardware_concurrency() threads in the frame constructor
    // - If PTHREAD_POOL_SIZE < hardware_concurrency, this will deadlock because:
    //   1. Threads 1-N use pre-warmed Web Workers
    //   2. Thread N+1 needs new Web Worker (posts to event loop)
    //   3. Main thread busy-waits for thread to start
    //   4. Busy-wait blocks event loop -> Worker message never processed
    //   5. DEADLOCK (timeout)

    await page.goto('/standalone/threadpool/threadpool_test.html');

    // If there's a deadlock, tryLoadApp will timeout waiting for canvas
    const loaded = await tryLoadApp(page, 30000);

    await page.screenshot({ path: 'test-results/threadpool-01-loaded.png', fullPage: true });

    // Check for success marker - all threads created and joined
    const success = testLogger.consoleLogs.some(log =>
      log.includes('[THREADPOOL] SUCCESS')
    );

    expect(loaded, 'App should load without deadlock').toBe(true);
    expect(success, 'All threads should complete successfully').toBe(true);
    expect(testLogger.errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Thread creation logs show all threads started', async ({ page, testLogger }) => {
    await page.goto('/standalone/threadpool/threadpool_test.html');

    const loaded = await tryLoadApp(page, 30000);
    expect(loaded, 'App should load without deadlock').toBe(true);

    // Extract hardware_concurrency from logs
    const hwLog = testLogger.consoleLogs.find(log =>
      log.includes('[THREADPOOL] hardware_concurrency:')
    );
    expect(hwLog, 'Should find hardware_concurrency log').toBeDefined();

    const match = hwLog!.match(/hardware_concurrency:\s*(\d+)/);
    expect(match, 'Should parse hardware_concurrency value').not.toBeNull();

    const expectedThreads = parseInt(match![1], 10);

    // Count "Thread X started" messages
    const threadStartedLogs = testLogger.consoleLogs.filter(log =>
      log.includes('[THREADPOOL] Thread') && log.includes('started')
    );

    // All threads should have started
    expect(threadStartedLogs.length).toBe(expectedThreads);
  });
});
