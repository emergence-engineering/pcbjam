// Reproduction probe #N for the KiCad Asyncify-fiber Chrome crash.
//
// Root-cause finding (DEBUG.md): the crash is the PCB_EDIT_FRAME ctor calling the
// VIRTUAL setupUIConditions() *after* the first tool coroutine (InvokeTool) has
// unwound+rewound the (deep) ctor stack via asyncify. That virtual call dispatches
// indirectly (-fexceptions) as: wasm -> invoke_vi(JS) -> instrumented dynCall_vi(JS)
// -> setupUIConditions. Chrome's V8 hard-crashes on it; Firefox tolerates it.
//
// nested_repro.cpp recreated the nested invoke_/dynCall chain + a coroutine yield and
// PASSED in both browsers. The factor it did NOT have: a NEW indirect "vi" call made
// from the rewound frame AFTER the coroutine round-trip. This probe adds exactly that.
//
// Shape (mirrors KiCad):
//   main -> level(N) ... -> level(0)            (deep stack via invoke_ try-hops)
//       -> run_coroutine(): co.Call -> Yield -> co.Resume   (asyncify unwind+rewind of main)
//       -> THEN g_obj->setupConditions()  (virtual, in try => invoke_vi -> dynCall_vi)
//
// Built no-wx + pthreads + -fexceptions + DYNCALLS + asyncify + the dyncall shim
// (LDFLAGS_COROUTINE_PTHREAD_NOWX). Firefox should reach "[REPRO] DONE"; if system
// Chrome crashes before DONE, we've reproduced the crash in isolation.

#include "kicad_coroutine_harness.h"

#include <emscripten.h>

#include <cstdint>
#include <cstdio>

using coroutine_test::TestCoroutine;

static const int kBoundaries = 20;  // nested invoke_/dynCall JS<->wasm hops (KiCad had ~11)

typedef void ( *LevelFn )( int );
static LevelFn g_level = nullptr;

// Polymorphic hierarchy so the post-coroutine call is a genuine (non-devirtualizable)
// virtual dispatch => call_indirect signature "vi" (the `this` pointer) => invoke_vi ->
// dynCall_vi, exactly like PCB_EDIT_FRAME's virtual setupUIConditions().
struct Base
{
    virtual void setupConditions() { std::printf( "[REPRO] Base::setupConditions\n" ); }
    virtual ~Base() {}
};
struct Derived : Base
{
    int m_n = 0;
    void setupConditions() override
    {
        // Mimic setupUIConditions: a biggish body with calls + allocations.
        volatile int s = 0;
        for( int i = 0; i < 64; ++i )
            s += i;
        m_n = s;
        std::printf( "[REPRO] Derived::setupConditions ran (n=%d)\n", m_n );
        std::fflush( stdout );
    }
};

// noinline factory returning a base pointer of a runtime-chosen type so the compiler
// cannot devirtualize the later g_obj->setupConditions() call.
static Base* makeObj( int seed ) __attribute__( ( noinline ) );
static Base* makeObj( int seed )
{
    return ( seed & 1 ) ? static_cast<Base*>( new Derived() ) : new Base();
}
static Base* g_obj = nullptr;

static void run_coroutine()
{
    // Mirror KiCad's TOOL_MANAGER pattern: RunMainStack (ContinueAfterRoot bounce) + Yield.
    TestCoroutine co( []( TestCoroutine& self ) {
        self.RunMainStack( []() {} );
        self.Yield( 42 );
    } );

    bool running = co.Call( 1 );    // drives the bounce + unwinds main through the invoke_ chain
    running = co.Resume( 2 );        // rewinds main + resumes
    std::printf( "[REPRO] coroutine done running=%d\n", (int) running );
    std::fflush( stdout );

    // *** THE CRASH FACTOR ***
    // Now (main stack just unwound+rewound) make a VIRTUAL call via invoke_vi ->
    // instrumented dynCall_vi from this rewound frame — exactly what the PCB_EDIT_FRAME
    // ctor does when it calls the virtual setupUIConditions() after InvokeTool.
    try
    {
        g_obj->setupConditions();
    }
    catch( ... )
    {
    }
    std::printf( "[REPRO] post-coroutine virtual call returned OK\n" );
    std::fflush( stdout );
}

extern "C" EMSCRIPTEN_KEEPALIVE void level( int depth )
{
    if( depth > 0 )
    {
        // Indirect call inside a try-region => invoke_vi wrapper => one nested
        // asyncify-unwindable JS<->wasm boundary per hop (the KiCad shape).
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

    run_coroutine();  // deepest hop
}

int main()
{
    g_obj = makeObj( 1 );  // a Derived, but via a noinline factory (non-devirtualizable)
    g_level = &level;
    std::printf( "[REPRO] start, %d nested boundaries, then a virtual call after the coroutine\n",
                 kBoundaries );
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
