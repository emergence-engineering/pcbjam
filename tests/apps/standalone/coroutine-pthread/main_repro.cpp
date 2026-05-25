// Isolated reproduction probe for the KiCad Asyncify-fiber x pthreads Chrome crash.
//
// Two factors that the existing (passing) coroutine harness does NOT combine:
//   1. pthreads (KiCad links -pthread + PTHREAD_POOL_SIZE; the standalone harness is
//      single-threaded).
//   2. the fiber swap originates from main() — so the Asyncify rewind re-enters
//      __main_argc_argv (matching the KiCad crash trace rewindId=0), whereas the
//      wx-callback harness re-enters a callback export instead.
//
// This program does both: runs the libcontext Call/Yield/Resume fiber pattern directly
// in main(), built with pthreads. NO wxWidgets (so the wx glue's worker-unsafe DOM
// access doesn't get in the way). printf goes to console; "[REPRO] DONE" means the
// rewind survived. If system Chrome crashes before DONE while Firefox prints DONE,
// we've reproduced the crash in isolation.

#include "kicad_coroutine_harness.h"

#include <cstdio>

using coroutine_test::TestCoroutine;

int main()
{
    std::printf( "[REPRO] start in main (__main_argc_argv)\n" );
    std::fflush( stdout );

    TestCoroutine coroutine( []( TestCoroutine& self ) {
        std::printf( "[REPRO] coroutine body running, about to yield\n" );
        std::fflush( stdout );
        self.Yield( 42 );
        std::printf( "[REPRO] coroutine resumed, finishing\n" );
        std::fflush( stdout );
    } );

    std::printf( "[REPRO] before Call (will unwind main; coroutine yields back -> rewind main)\n" );
    std::fflush( stdout );

    bool running = coroutine.Call( 1 );
    std::printf( "[REPRO] after Call: running=%d lastValue=%ld\n",
                 (int) running, (long) coroutine.LastReturnValue() );
    std::fflush( stdout );

    running = coroutine.Resume( 2 );
    std::printf( "[REPRO] after Resume: running=%d\n", (int) running );
    std::fflush( stdout );

    std::printf( "[REPRO] DONE\n" );
    std::fflush( stdout );
    return 0;
}
