// Reproduction probe #4: activate the coroutine from inside an emscripten_set_main_loop
// (requestAnimationFrame) callback — the SINGLE JS->wasm boundary KiCad actually uses
// (rAF -> callUserCallback -> iterFunc -> dynCall_v -> wasm refresh -> tool coroutine).
// The crash trace's "main-refresh ctx=#2" is exactly this. Unlike the EM_JS/embind probes,
// there is NO synchronous JS frame sitting above the coroutine — the coroutine runs in a
// wasm chain below dynCall_v, so the Asyncify rewind re-enters via dynCall_v (like KiCad).
//
// No-wx + pthreads. Firefox should reach "[REPRO] DONE"; if system Chrome crashes before
// DONE, the main-loop/rAF activation is the missing factor.

#include "kicad_coroutine_harness.h"

#include <emscripten.h>

#include <cstdio>

using coroutine_test::TestCoroutine;

static int g_frame = 0;

static void run_coroutine()
{
    TestCoroutine co( []( TestCoroutine& self ) {
        std::printf( "[REPRO] coroutine body running, about to yield\n" );
        std::fflush( stdout );
        self.Yield( 42 );
    } );

    bool running = co.Call( 1 );  // unwinds the main-loop callback back to dynCall_v; yields back
    std::printf( "[REPRO] after Call: running=%d lastValue=%ld\n",
                 (int) running, (long) co.LastReturnValue() );
    std::fflush( stdout );

    running = co.Resume( 2 );
    std::printf( "[REPRO] after Resume: running=%d\n", (int) running );
    std::fflush( stdout );
}

static void main_loop_iter()
{
    ++g_frame;
    std::printf( "[REPRO] main-loop frame %d\n", g_frame );
    std::fflush( stdout );

    if( g_frame >= 2 )
    {
        std::printf( "[REPRO] activating coroutine inside main-loop refresh\n" );
        std::fflush( stdout );
        run_coroutine();
        std::printf( "[REPRO] DONE\n" );
        std::fflush( stdout );
        emscripten_cancel_main_loop();
    }
}

int main()
{
    std::printf( "[REPRO] start; installing emscripten_set_main_loop (rAF)\n" );
    std::fflush( stdout );
    emscripten_set_main_loop( main_loop_iter, 0, 0 );  // main returns; rAF drives main_loop_iter
    return 0;
}
