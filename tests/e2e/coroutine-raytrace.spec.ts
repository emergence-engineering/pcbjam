import { test, expect } from './utils/fixtures';

// Reproduction + fix validation for the KiCad WASM raytracer threading deadlock
// (kicad/3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp). One binary,
// switchable by URL ?m=:
//   m=0 A  detached threads + std::this_thread::sleep_for  -> DEADLOCK (reproduces the bug)
//   m=1 B1 detached threads + emscripten_sleep yield        -> multi-core (works in isolation)
//   m=2 B2 persistent pool   + emscripten_sleep yield        -> multi-core (works in isolation)
//   m=3 C  serial on the calling thread                      -> the shipped fallback
//   m=4    B1 with stack-local atomics                       -> multi-core (locals survive yield)
//   m=5 B3 persistent pool   + sleep_for busy-wait           -> multi-core (no emscripten_sleep)
//
// NOTE: this is a STANDALONE wxWidgets harness — it re-implements the threading patterns
// itself and has NO connection to KiCad's render_3d_raytrace_base.cpp. It passes
// regardless of what the real viewer ships; it exists to prove the deadlock + the fix
// mechanism in seconds (not the ~12-min KiCad build).
//
// TODO(asyncify-nesting): the real KiCad 3D viewer currently ships SERIAL (single-core).
// The emscripten_sleep variants (B1/B2/m4) pass HERE but ABORT the real viewer with
// `Aborted(invalid state: 1)`: the viewer renders inside the wx modal/event-pump, which is
// already mid-Asyncify-unwind, and emscripten_sleep can't nest on that context. This
// harness runs from a clean OnInit, so it never hits that nesting — a reminder that an
// isolated repro can be faithful to the *threading* yet miss the *Asyncify context*.
// The B3/persistent-pool design (m=5) avoids emscripten_sleep entirely and was the one
// ported into KiCad — but it's currently PARKED (`git -C kicad stash`) pending research
// into whether a nestable yield (fibers / emscripten_fiber_swap / JSPI) is possible.
//
// Named coroutine-* so playwright-coroutine.config.ts runs it in real Chrome + Firefox
// (same engines as the KiCad app), and the default config runs it in bundled Chromium.

const APP = '/standalone/raytrace-threads/raytrace_threads_test.html';
// Modest, fixed work so each pass is ~1-2s serial (enough to show a clear speedup).
// NOTE: params go in the URL FRAGMENT (#...), not the query (?...): serve-handler's
// default cleanUrls 301-redirects *.html and strips the query string; the fragment
// is client-side and survives the redirect.
const WORK = 'blocks=48&iters=3000000';

interface Success { mode: number; workersRan: number; totalMs: number; }

function parseSuccess( logs: string[], mode: number ): Success | null {
  const tag = `SUCCESS mode=${mode}`;
  const line = logs.find( l => l.includes( tag ) );
  if( !line ) return null;
  const m = line.match( /SUCCESS mode=(\d+) workersRan=(\d+) totalMs=(\d+)/ );
  return m ? { mode: +m[1], workersRan: +m[2], totalMs: +m[3] } : null;
}

async function waitForLog( testLogger: { consoleLogs: string[] }, needle: string, timeout = 60000 ) {
  await expect
    .poll( () => testLogger.consoleLogs.some( l => l.includes( needle ) ), { timeout } )
    .toBe( true );
}

test.describe( 'Raytracer threading (render_3d_raytrace_base.cpp repro)', () => {

  test( 'C: serial baseline completes on a single thread', async ( { page, testLogger } ) => {
    await page.goto( `${APP}#m=3&${WORK}` );
    await waitForLog( testLogger, '[RTPOOL] SUCCESS mode=3' );
    const r = parseSuccess( testLogger.consoleLogs, 3 )!;
    expect( r.workersRan, 'serial runs on exactly one thread' ).toBe( 1 );
  } );

  test( 'B1: detached threads + emscripten_sleep yield → multi-core, no deadlock', async ( { page, testLogger } ) => {
    await page.goto( `${APP}#m=1&${WORK}` );
    await waitForLog( testLogger, '[RTPOOL] SUCCESS mode=1' );
    const r = parseSuccess( testLogger.consoleLogs, 1 )!;
    expect( r.workersRan, 'work should run on multiple worker threads' ).toBeGreaterThan( 1 );
    expect( testLogger.consoleLogs.some( l => l.includes( '[RTPOOL] FAIL' ) ) ).toBe( false );
  } );

  test( 'B2: persistent pool + yield → multi-core across repeated passes', async ( { page, testLogger } ) => {
    await page.goto( `${APP}#m=2&passes=3&${WORK}` );
    await waitForLog( testLogger, '[RTPOOL] SUCCESS mode=2' );
    const r = parseSuccess( testLogger.consoleLogs, 2 )!;
    expect( r.workersRan ).toBeGreaterThan( 1 );
    for( const p of [0, 1, 2] )
      expect( testLogger.consoleLogs.some( l => l.includes( `PASS done pass=${p}` ) ),
              `pass ${p} should complete (pool reused)` ).toBe( true );
  } );

  test( 'B1-local: stack-local atomics (mirrors raytracer) survive Asyncify yields', async ( { page, testLogger } ) => {
    // The real raytracer shares stack-local atomics (threadsFinished/nextBlock) with
    // its workers. This proves emscripten_sleep's unwind/rewind doesn't lose the
    // workers' concurrent writes to those C-stack locals (which would hang forever).
    await page.goto( `${APP}#m=4&${WORK}` );
    await waitForLog( testLogger, '[RTPOOL] SUCCESS mode=4' );
    const r = parseSuccess( testLogger.consoleLogs, 4 )!;
    expect( r.workersRan, 'work runs on multiple threads with local atomics' ).toBeGreaterThan( 1 );
    expect( testLogger.consoleLogs.some( l => l.includes( '[RTPOOL] FAIL' ) ) ).toBe( false );
  } );

  test( 'B3: persistent pool + sleep_for busy-wait (real raytracer mechanism) → multi-core', async ( { page, testLogger } ) => {
    // This is the exact mechanism ported into the raytracer: pre-alive workers, NO
    // emscripten_sleep (so no Asyncify nesting), main-thread busy-wait that still
    // completes because the workers run on their own cores.
    await page.goto( `${APP}#m=5&passes=3&${WORK}` );
    await waitForLog( testLogger, '[RTPOOL] SUCCESS mode=5' );
    const r = parseSuccess( testLogger.consoleLogs, 5 )!;
    expect( r.workersRan, 'busy-wait pool runs on multiple cores' ).toBeGreaterThan( 1 );
    expect( testLogger.consoleLogs.some( l => l.includes( '[RTPOOL] FAIL' ) ) ).toBe( false );
  } );

  test( 'multi-core (B1) is faster than serial (C)', async ( { page, testLogger } ) => {
    await page.goto( `${APP}#m=3&${WORK}` );
    await waitForLog( testLogger, '[RTPOOL] SUCCESS mode=3' );
    await page.goto( `${APP}#m=1&${WORK}` );
    await waitForLog( testLogger, '[RTPOOL] SUCCESS mode=1' );

    const serial = parseSuccess( testLogger.consoleLogs, 3 )!;
    const parallel = parseSuccess( testLogger.consoleLogs, 1 )!;
    const speedup = serial.totalMs / parallel.totalMs;
    console.log( `[spec] serial=${serial.totalMs}ms parallel=${parallel.totalMs}ms ` +
                 `speedup=${speedup.toFixed( 2 )}x workers=${parallel.workersRan}` );

    expect( parallel.totalMs, 'parallel should beat serial' ).toBeLessThan( serial.totalMs );
  } );

  test( 'A: detached threads + busy-wait reproduces the deadlock', async ( { page, testLogger } ) => {
    // The main thread busy-waits, never returns to the event loop, so the on-demand
    // workers never start. The in-test 12s guard then prints the DEADLOCK marker.
    await page.goto( `${APP}#m=0&${WORK}`, { waitUntil: 'domcontentloaded' } );
    await waitForLog( testLogger, '[RTPOOL] DEADLOCK', 30000 );
    expect( testLogger.consoleLogs.some( l => l.includes( '[RTPOOL] SUCCESS' ) ),
            'no pass should succeed under the busy-wait' ).toBe( false );
  } );
} );
