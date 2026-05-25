// Reproduction probe #2 for the KiCad Asyncify-fiber Chrome crash.
//
// KiCad's crashing main-context rewind replays through ~11 NESTED dynCall_* (JS<->wasm
// boundary) frames. Those frames come from C++ invoke_* exception wrappers: an indirect
// call inside a try-region compiles to wasm -> invoke_vi(JS) -> dynCall_vi(JS) -> wasm,
// and invoke_* is in ASYNCIFY_IMPORTS so asyncify can unwind/rewind through it (which is
// why Firefox tolerates it). This program recreates that shape: from main, recurse
// through N indirect-call-in-try hops (each an invoke_/dynCall JS<->wasm boundary), then
// at the deepest hop run a coroutine that yields back -> main rewinds through the chain.
//
// Built no-wx + pthreads + exceptions, ASYNCIFY_IMPORTS=invoke_*,emscripten_fiber_swap
// (matching KiCad). Firefox should reach "[REPRO] DONE"; if system Chrome crashes before
// DONE, we've reproduced the crash in isolation.

#include "kicad_coroutine_harness.h"

#include <emscripten.h>

#include <cstdint>
#include <cstdio>

using coroutine_test::TestCoroutine;

static const int kBoundaries = 20;  // nested invoke_/dynCall JS<->wasm hops (KiCad had ~11)

typedef void ( *LevelFn )( int );
static LevelFn g_level = nullptr;  // indirect-call target (forces invoke_vi wrappers)

static void run_coroutine()
{
    // Mirror KiCad's TOOL_MANAGER pattern: the tool coroutine does RunMainStack
    // (CALL_CONTEXT / ContinueAfterRoot bounce — run work on the main stack, then resume),
    // then a Wait-style Yield. KiCad startup tools use exactly this, not a plain Yield.
    TestCoroutine co( []( TestCoroutine& self ) {
        std::printf( "[REPRO] coroutine body running, RunMainStack bounce\n" );
        std::fflush( stdout );
        self.RunMainStack( []() {
            std::printf( "[REPRO] main-stack lambda ran (ContinueAfterRoot)\n" );
            std::fflush( stdout );
        } );
        std::printf( "[REPRO] coroutine resumed after RunMainStack, about to yield\n" );
        std::fflush( stdout );
        self.Yield( 42 );
    } );

    bool running = co.Call( 1 );  // drives the bounce + unwinds main through the invoke_ chain
    std::printf( "[REPRO] after Call: running=%d lastValue=%ld\n",
                 (int) running, (long) co.LastReturnValue() );
    std::fflush( stdout );

    running = co.Resume( 2 );
    std::printf( "[REPRO] after Resume: running=%d\n", (int) running );
    std::fflush( stdout );
}

extern "C" EMSCRIPTEN_KEEPALIVE void level( int depth )
{
    if( depth > 0 )
    {
        // Indirect call inside a try-region => Emscripten emits an invoke_vi wrapper:
        // wasm -> invoke_vi(JS) -> dynCall_vi(JS) -> wasm. One nested asyncify-unwindable
        // JS<->wasm boundary per hop (the KiCad shape).
        try
        {
            g_level( depth - 1 );
        }
        catch( ... )
        {
            throw;
        }
        return;
    }

    run_coroutine();  // deepest hop: coroutine yields -> main rewinds through the chain
}

int main()
{
    g_level = &level;
    std::printf( "[REPRO] start, %d nested invoke_/dynCall JS<->wasm boundaries\n", kBoundaries );
    std::fflush( stdout );

    try
    {
        g_level( kBoundaries );
    }
    catch( ... )
    {
    }

    std::printf( "[REPRO] DONE\n" );
    std::fflush( stdout );
    return 0;
}
