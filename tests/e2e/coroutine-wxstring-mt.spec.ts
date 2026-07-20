import { test, expect } from './utils/fixtures';

// wxString UTF-8 build under threads (tests/apps/standalone/wxstring-mt).
//
// The UTF-8 wxString updates bookkeeping on read-only access: an intrusive
// registry of live iterators (per-THREAD lists since the wasm-port fix in
// wxwidgets include/wx/string.h — historically a list inside each string
// object, which made concurrent reads of a SHARED string race), and a
// per-thread position cache (disabled under Emscripten — its entries could
// outlive a string destroyed by another thread and mis-describe a new string
// at a reused address). These modes were built red-first against stock wx:
// modes 1 and 4 trapped/corrupted (mode 4 with the exact editor trap
// signatures: "index out of bounds" / "indirect call to null"), and turned
// green with the per-thread registry + disabled cache. Modes 0/2/3 guard the
// surrounding behavior (mode 2/3: the iterator fix-up feature the registry
// exists for must keep working; mode 3 also proves the registration writes
// are not optimized away — without it, mode 0/4 could silently test nothing).
//
// Named coroutine-* so playwright's coroutine-firefox project runs it on real
// Firefox in addition to wx-chromium (pthread app; WebKit is skipped).

const APP = '/standalone/wxstring-mt/wxstring_mt_test.html';

const MODES: { m: number; name: string; minRounds: number }[] = [
  { m: 0, name: 'concurrent iteration of one shared string', minRounds: 10000 },
  { m: 1, name: 'position-cache cross-thread destroy + address reuse', minRounds: 10 },
  { m: 2, name: 'iterator fix-up across width-changing edits', minRounds: 1000 },
  { m: 3, name: 'registration liveness (fix-up through opaque calls)', minRounds: 100 },
  { m: 4, name: 'shared-string compares + wide-literal conversions', minRounds: 10000 },
];

async function waitForLog( testLogger: { consoleLogs: string[] }, needle: string, timeout = 60000 ) {
  await expect.poll( () => testLogger.consoleLogs.some( l => l.includes( needle ) ), { timeout } ).toBe( true );
}

test.describe( 'wxString UTF-8 multithreading (per-thread iterator registry, pos cache off)', () => {

  for( const { m, name, minRounds } of MODES ) {
    test( `mode ${m}: ${name}`, async ( { page, testLogger } ) => {
      await page.goto( `${APP}#m=${m}` );
      await waitForLog( testLogger, `[WXSTR] SUCCESS mode=${m}` );

      const line = testLogger.consoleLogs.find( l => l.includes( `[WXSTR] SUCCESS mode=${m}` ) )!;
      const rounds = +( line.match( /rounds=(\d+)/ )?.[1] ?? -1 );
      expect( rounds, 'the mode must have done real work' ).toBeGreaterThanOrEqual( minRounds );

      expect( testLogger.consoleLogs.filter( l => l.includes( '[WXSTR] CORRUPT' ) ),
              'no verified corruption' ).toHaveLength( 0 );
      expect( testLogger.errors.filter( e => !e.includes( 'favicon' ) ),
              'no runtime errors' ).toHaveLength( 0 );
    } );
  }
} );
