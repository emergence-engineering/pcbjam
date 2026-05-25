// Reproduction probe #3: add embind (--bind) to the (exonerated) coroutine layer.
//
// KiCad is built with --bind (pcbnew_embind.o); UI/JS reaches C++ tool code through the
// embind dispatch (which uses dynCall trampolines). This probe activates the coroutine
// FROM an embind method call (JS -> Module.ToolHost.activate() -> C++ -> coroutine), so
// that when the coroutine yields back, the Asyncify rewind must replay through the embind
// dispatch frame. Built no-wx + pthreads + exceptions + --bind. Firefox should reach
// "[REPRO] DONE"; if system Chrome crashes before DONE, embind is the missing factor.

#include <emscripten/bind.h>
#include <emscripten.h>

#include "kicad_coroutine_harness.h"

#include <cstdio>

using namespace emscripten;
using coroutine_test::TestCoroutine;

static void run_coroutine()
{
    TestCoroutine co( []( TestCoroutine& self ) {
        std::printf( "[REPRO] coroutine body running, RunMainStack + yield\n" );
        std::fflush( stdout );
        self.RunMainStack( []() {
            std::printf( "[REPRO] main-stack lambda ran\n" );
            std::fflush( stdout );
        } );
        self.Yield( 42 );
    } );

    bool running = co.Call( 1 );
    std::printf( "[REPRO] after Call: running=%d lastValue=%ld\n",
                 (int) running, (long) co.LastReturnValue() );
    std::fflush( stdout );

    running = co.Resume( 2 );
    std::printf( "[REPRO] after Resume: running=%d\n", (int) running );
    std::fflush( stdout );
}

// A C++ class reached from JS via embind (mirrors KiCad's UI->C++ tool dispatch).
struct ToolHost
{
    void activate()
    {
        std::printf( "[REPRO] ToolHost::activate (via embind) -> run coroutine\n" );
        std::fflush( stdout );
        run_coroutine();  // coroutine yields -> rewind replays through the embind dispatch
    }
};

EMSCRIPTEN_BINDINGS( repro )
{
    class_<ToolHost>( "ToolHost" )
        .constructor<>()
        .function( "activate", &ToolHost::activate );
}

int main()
{
    std::printf( "[REPRO] start, activating coroutine via embind\n" );
    std::fflush( stdout );

    // JS -> embind -> C++ ToolHost::activate -> coroutine
    EM_ASM( {
        var h = new Module.ToolHost();
        h.activate();
        h.delete();
    } );

    std::printf( "[REPRO] DONE\n" );
    std::fflush( stdout );
    return 0;
}
