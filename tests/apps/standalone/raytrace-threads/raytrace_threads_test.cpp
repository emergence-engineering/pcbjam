/**
 * raytrace_threads_test.cpp
 *
 * Minimal, fast-building reproduction of the KiCad WASM raytracer threading
 * deadlock (kicad/3d-viewer/3d_rendering/raytracing/render_3d_raytrace_base.cpp,
 * the post-process passes), PLUS candidate fixes — all in one binary, switchable
 * by URL query param so we build ONCE and test every variant.
 *
 * ------------------------------------------------------------------------------
 * THE PATTERN WE'RE REPRODUCING (raytracer post-process, desktop path):
 *
 *     for (i in 0..N) { std::thread t(worker); t.detach(); }   // spawn N workers
 *     while (threadsFinished < N)                              // ...then WAIT
 *         std::this_thread::sleep_for(10ms);                   // by busy-looping
 *
 * WHY IT DEADLOCKS IN THE BROWSER:
 *  - std::thread == a Web Worker. Creating one needs a message processed by the
 *    browser MAIN-THREAD event loop.
 *  - KiCad already pre-spawned hardware_concurrency() thread-pool workers at
 *    startup, so the pre-warmed worker slots
 *    (-sPTHREAD_POOL_SIZE='navigator.hardwareConcurrency') are already full.
 *    The raytracer's new threads must therefore be spawned ON DEMAND, which
 *    again needs the event loop.
 *  - The busy-wait `sleep_for` NEVER returns to the event loop, so those new
 *    workers are never created -> threadsFinished never advances -> frozen tab.
 *
 * THE FIX: don't busy-wait — YIELD. emscripten_sleep() (Asyncify) hands control
 * back to the event loop each tick, so the pending worker spawns complete and
 * the workers actually run on real cores.
 *
 * TODO(asyncify-nesting) — IMPORTANT CAVEAT this harness does NOT capture: the
 * emscripten_sleep variants (B1/B2/m4) pass here but ABORT the real KiCad 3D viewer
 * with `Aborted(invalid state: 1)`. The viewer renders inside the wx modal/event-pump,
 * which is already mid-Asyncify-unwind, and emscripten_sleep can't nest on that context.
 * This program runs from a clean OnInit, so it never nests. The variant actually ported
 * to KiCad is B3 (m=5): a persistent pool + sleep_for busy-wait — NO emscripten_sleep, so
 * no nesting. That multi-core port is currently PARKED (git -C kicad stash) pending
 * research into whether a nestable yield (fibers / emscripten_fiber_swap / JSPI) works.
 *
 * To reproduce KiCad faithfully we first pre-spawn `park` "parked" workers that
 * block on a condition variable (zero CPU) to occupy the pool slots — exactly
 * what KiCad's singleton thread pool does. Set ?park=0 to show that WITHOUT that
 * pre-existing pool, variant A does NOT deadlock (hwc threads fit in hwc slots).
 *
 * ------------------------------------------------------------------------------
 * URL params (all optional):
 *   ?m=0   variant A  : detached threads + std::this_thread::sleep_for  (EXPECT DEADLOCK)
 *   ?m=1   variant B1 : detached threads + emscripten_sleep yield        (FIX, fresh threads)
 *   ?m=2   variant B2 : persistent pre-warmed pool + emscripten_sleep     (FIX, reused threads)
 *   ?m=3   variant C  : serial on the calling thread                      (current shipped fallback)
 *   ?park=K  parked workers pre-spawned to exhaust the pool (default = hardware_concurrency)
 *   ?work=K  worker threads the pass uses (default = hardware_concurrency)
 *   ?blocks=K  number of work blocks (default 64)
 *   ?iters=K   compute iterations per block (default 4000000; tune so serial ~2-3s)
 *   ?passes=K  how many times to run the pass (default 1; use >1 to show B2 reuse)
 *
 * Console contract (the Playwright spec asserts on these):
 *   [RTPOOL] START m=.. park=.. work=.. blocks=.. iters=.. passes=.. hwc=..
 *   [RTPOOL] PASS done pass=.. workersRan=.. passMs=..
 *   [RTPOOL] DEADLOCK pass=.. ...                 (variant A)
 *   [RTPOOL] SUCCESS mode=.. workersRan=.. totalMs=..
 *   [RTPOOL] FAIL deadlocked mode=.. totalMs=..   (variant A)
 */

#include "wx/wx.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <climits>
#include <cmath>
#include <condition_variable>
#include <cstdarg>
#include <cstdio>
#include <mutex>
#include <thread>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

using clock_t_ = std::chrono::steady_clock;

// ----------------------------------------------------------------------------
// logging: print to stdout AND the browser console (Playwright captures console)
// ----------------------------------------------------------------------------
static void rtlog( const char* fmt, ... )
{
    char buf[512];
    va_list ap;
    va_start( ap, fmt );
    vsnprintf( buf, sizeof( buf ), fmt, ap );
    va_end( ap );

#ifdef __EMSCRIPTEN__
    // NOTE: only console.log here. Emscripten already routes printf/stdout to
    // console.log, so doing both would duplicate every line.
    EM_ASM( { console.log( UTF8ToString( $0 ) ); }, buf );
#else
    printf( "%s\n", buf );
#endif
}

// ----------------------------------------------------------------------------
// read the URL query params in one shot into out[6] = {m,park,work,blocks,iters,passes}.
// INT_MIN means "param absent -> use the C++ default". We write through HEAP32 (an
// exported runtime method) instead of UTF8ToString/setValue, which are NOT guaranteed
// to be present in the EM_ASM scope under this build's EXPORTED_RUNTIME_METHODS.
// ----------------------------------------------------------------------------
static void readUrlParams( int* out /* [6] */ )
{
    for( int i = 0; i < 6; ++i )
        out[i] = INT_MIN;
#ifdef __EMSCRIPTEN__
    EM_ASM(
        {
            // serve-handler defaults cleanUrls:true, which 301-redirects *.html and
            // DROPS the query string -> read the fragment (#...) too, which survives.
            var raw = location.search ? location.search.slice( 1 ) : location.hash.slice( 1 );
            var p = new URLSearchParams( raw );
            function gi( name )
            {
                var v = p.get( name );
                if( !v )
                    return -2147483648; // INT_MIN sentinel
                var x = parseInt( v, 10 );
                return isNaN( x ) ? -2147483648 : x;
            }
            var b = $0 >> 2;
            HEAP32[b + 0] = gi( 'm' );
            HEAP32[b + 1] = gi( 'park' );
            HEAP32[b + 2] = gi( 'work' );
            HEAP32[b + 3] = gi( 'blocks' );
            HEAP32[b + 4] = gi( 'iters' );
            HEAP32[b + 5] = gi( 'passes' );
            console.log( '[RTPOOL] location.search=' + location.search );
        },
        out );
#endif
}

static long elapsedMs( clock_t_::time_point t0 )
{
    return (long) std::chrono::duration_cast<std::chrono::milliseconds>(
                   clock_t_::now() - t0 ).count();
}

// ----------------------------------------------------------------------------
// the shared "work" — mirrors the raytracer: workers cooperatively drain a
// global atomic block counter; each block is pure CPU math (no JS/DOM/wx — the
// reason the real raytracer workers are safe to run off the main thread).
// ----------------------------------------------------------------------------
static std::atomic<size_t> g_nextBlock{ 0 };
static std::atomic<size_t> g_threadsFinished{ 0 };
static std::atomic<int>    g_workersRan{ 0 };       // distinct workers that ran >=1 block
static std::atomic<double> g_sink{ 0.0 };           // keep the optimizer honest
static int                 g_numBlocks = 64;
static long                g_iters = 4000000;

static double computeBlock( int b, long iters )
{
    double acc = 0.0;
    for( long i = 0; i < iters; ++i )
        acc += std::sin( (double) ( b * 131 + i ) * 1e-6 ) * std::cos( (double) i * 1e-7 );
    return acc;
}

static void workerBody()
{
    bool counted = false;
    for( ;; )
    {
        size_t b = g_nextBlock.fetch_add( 1 );
        if( b >= (size_t) g_numBlocks )
            break;
        if( !counted )
        {
            g_workersRan.fetch_add( 1 );
            counted = true;
        }
        double r = computeBlock( (int) b, g_iters );
        g_sink.store( g_sink.load( std::memory_order_relaxed ) + r, std::memory_order_relaxed );
    }
    g_threadsFinished.fetch_add( 1 );
}

static void resetPass()
{
    g_nextBlock.store( 0 );
    g_threadsFinished.store( 0 );
    g_workersRan.store( 0 );
}

// ----------------------------------------------------------------------------
// "parked" pool — block N workers on a condition variable (zero CPU) to occupy
// the pre-warmed pool slots, exactly like KiCad's singleton thread pool.
// ----------------------------------------------------------------------------
static std::mutex              g_parkMtx;
static std::condition_variable g_parkCv;
static bool                    g_parkRelease = false;

static void spawnParkedPool( int p )
{
    for( int i = 0; i < p; ++i )
    {
        std::thread(
            []
            {
                std::unique_lock<std::mutex> lk( g_parkMtx );
                g_parkCv.wait( lk, [] { return g_parkRelease; } );
            } )
            .detach();
    }
}

static void releaseParkedPool()
{
    {
        std::lock_guard<std::mutex> lk( g_parkMtx );
        g_parkRelease = true;
    }
    g_parkCv.notify_all();
}

// ----------------------------------------------------------------------------
// variant A: detached threads + std::this_thread::sleep_for busy-wait.
// Returns true if a deadlock was detected (workers never finished within 12s).
// ----------------------------------------------------------------------------
static bool waitBusy( int n )
{
    auto start = clock_t_::now();
    while( g_threadsFinished.load() < (size_t) n )
    {
        std::this_thread::sleep_for( std::chrono::milliseconds( 10 ) );
        if( std::chrono::duration_cast<std::chrono::seconds>( clock_t_::now() - start ).count() >= 12 )
            return true; // deadlock: the event loop never ran, workers never started
    }
    return false;
}

// ----------------------------------------------------------------------------
// variant B1: detached threads + emscripten_sleep yield-poll.
// ----------------------------------------------------------------------------
static void waitYield( int n )
{
    while( g_threadsFinished.load() < (size_t) n )
    {
#ifdef __EMSCRIPTEN__
        emscripten_sleep( 10 ); // Asyncify: hand control back to the event loop
#else
        std::this_thread::sleep_for( std::chrono::milliseconds( 10 ) );
#endif
    }
}

// ----------------------------------------------------------------------------
// variant B2: a persistent pre-warmed worker pool. Workers are created once and
// block on a condition variable between passes (blocking is fine on workers —
// only the MAIN thread can't block). Each pass: main bumps the generation,
// notifies, then emscripten_sleep-polls the done counter.
// ----------------------------------------------------------------------------
struct PersistentPool
{
    int                      n = 0;
    std::vector<std::thread> ts;
    std::mutex               mtx;
    std::condition_variable  cv;
    unsigned long            generation = 0;
    bool                     stop = false;
    std::atomic<size_t>      finished{ 0 };
    std::atomic<size_t>      started{ 0 };   // workers that have come alive

    void start( int n_ )
    {
        n = n_;
        for( int i = 0; i < n; ++i )
            ts.emplace_back( [this] { loop(); } );
    }

    bool ready() const { return started.load() == (size_t) n; }

    void loop()
    {
        started.fetch_add( 1 );
        unsigned long seen = 0;
        for( ;; )
        {
            std::unique_lock<std::mutex> lk( mtx );
            cv.wait( lk, [&] { return stop || generation != seen; } );
            if( stop )
                return;
            seen = generation;
            lk.unlock();

            workerBody(); // drains g_nextBlock cooperatively with the other workers
            finished.fetch_add( 1 );
        }
    }

    void runPass() // called on the MAIN thread
    {
        finished.store( 0 );
        resetPass();
        {
            std::lock_guard<std::mutex> lk( mtx );
            ++generation;
        }
        cv.notify_all();
        while( finished.load() < (size_t) n )
        {
#ifdef __EMSCRIPTEN__
            emscripten_sleep( 5 );
#else
            std::this_thread::sleep_for( std::chrono::milliseconds( 5 ) );
#endif
        }
    }

    // Like runPass(), but waits with a BUSY sleep_for (NOT emscripten_sleep). This is
    // the mechanism the real raytracer uses: the workers are already alive, so a
    // main-thread busy-wait still completes (they run on their own cores), and there
    // is NO emscripten_sleep — so it can't hit the Asyncify-nesting abort that the
    // real 3D viewer triggers under its modal/event-pump. REQUIRES ready()==true.
    void runPassBusyWait() // called on the MAIN thread
    {
        finished.store( 0 );
        resetPass();
        {
            std::lock_guard<std::mutex> lk( mtx );
            ++generation;
        }
        cv.notify_all();
        while( finished.load() < (size_t) n )
            std::this_thread::sleep_for( std::chrono::microseconds( 200 ) );
    }
};

static PersistentPool g_pool;

// ----------------------------------------------------------------------------
// app
// ----------------------------------------------------------------------------
class RtFrame : public wxFrame
{
public:
    RtFrame() : wxFrame( nullptr, wxID_ANY, "Raytrace Threads Repro",
                         wxDefaultPosition, wxSize( 420, 160 ) )
    {
        wxPanel* panel = new wxPanel( this );
        wxBoxSizer* sizer = new wxBoxSizer( wxVERTICAL );
        sizer->Add( new wxStaticText( panel, wxID_ANY,
                                      "Raytrace threading repro — see the console." ),
                    0, wxALL, 16 );
        panel->SetSizer( sizer );
    }
};

class RtApp : public wxApp
{
public:
    bool OnInit() override
    {
        const int hwc = std::max( 1u, std::thread::hardware_concurrency() );

        int raw[6];
        readUrlParams( raw );
        auto pick = [&]( int i, int dflt ) { return raw[i] == INT_MIN ? dflt : raw[i]; };

        const int mode = pick( 0, 0 );
        const int park = pick( 1, hwc );
        const int work = pick( 2, hwc );
        g_numBlocks = pick( 3, 64 );
        g_iters = (long) pick( 4, 4000000 );
        const int passes = pick( 5, 1 );

        rtlog( "[RTPOOL] START m=%d park=%d work=%d blocks=%d iters=%ld passes=%d hwc=%d",
               mode, park, work, g_numBlocks, g_iters, passes, hwc );

        // exhaust the pre-warmed pool (skip for the pure-serial baseline)
        if( mode != 3 && park > 0 )
        {
            spawnParkedPool( park );
            rtlog( "[RTPOOL] parked %d workers (pool slots now exhausted)", park );
        }

        auto t0 = clock_t_::now();
        bool deadlocked = false;

        for( int pass = 0; pass < passes && !deadlocked; ++pass )
        {
            auto p0 = clock_t_::now();

            switch( mode )
            {
            case 3: // C — serial on the calling (main) thread
                resetPass();
                workerBody();
                break;

            case 0: // A — detached threads + busy-wait (expected deadlock)
                resetPass();
                for( int i = 0; i < work; ++i )
                    std::thread( workerBody ).detach();
                deadlocked = waitBusy( work );
                break;

            case 1: // B1 — detached threads + emscripten_sleep yield
                resetPass();
                for( int i = 0; i < work; ++i )
                    std::thread( workerBody ).detach();
                waitYield( work );
                break;

            case 2: // B2 — persistent pool + emscripten_sleep yield
                if( pass == 0 )
                    g_pool.start( work );
                g_pool.runPass();
                break;

            case 4: // B1 but with STACK-LOCAL atomics — mirrors the real raytracer
                    // EXACTLY (threadsFinished/nextBlock are locals shared by ref with
                    // the workers). Proves Asyncify's emscripten_sleep unwind/rewind
                    // doesn't clobber concurrent worker writes to C-stack locals.
            {
                std::atomic<size_t> lNext( 0 );
                std::atomic<size_t> lFinished( 0 );
                std::atomic<int> lRan( 0 );
                auto localWorker = [&]()
                {
                    bool counted = false;
                    for( ;; )
                    {
                        size_t b = lNext.fetch_add( 1 );
                        if( b >= (size_t) g_numBlocks )
                            break;
                        if( !counted )
                        {
                            lRan.fetch_add( 1 );
                            counted = true;
                        }
                        g_sink.store( g_sink.load( std::memory_order_relaxed )
                                              + computeBlock( (int) b, g_iters ),
                                      std::memory_order_relaxed );
                    }
                    lFinished.fetch_add( 1 );
                };
                for( int i = 0; i < work; ++i )
                    std::thread( localWorker ).detach();
                while( lFinished.load() < (size_t) work )
#ifdef __EMSCRIPTEN__
                    emscripten_sleep( 2 );
#else
                    std::this_thread::sleep_for( std::chrono::milliseconds( 10 ) );
#endif
                g_workersRan.store( lRan.load() );
                break;
            }

            case 5: // B3 — persistent pool + sleep_for BUSY-WAIT. This is the REAL
                    // raytracer's mechanism: workers are pre-alive, so a main-thread
                    // busy-wait still completes (no event-loop dependency), and there is
                    // NO emscripten_sleep, so it can't hit the Asyncify-nesting abort the
                    // 3D viewer triggers under its modal/event-pump.
                if( pass == 0 )
                {
                    g_pool.start( work );
                    // Warm up: the workers must actually be created (needs the event loop).
                    // In the real app this happens across paint frames; here we yield once.
                    while( !g_pool.ready() )
#ifdef __EMSCRIPTEN__
                        emscripten_sleep( 5 );
#else
                        std::this_thread::sleep_for( std::chrono::milliseconds( 5 ) );
#endif
                }
                g_pool.runPassBusyWait();
                break;
            }

            long passMs = elapsedMs( p0 );
            if( deadlocked )
                rtlog( "[RTPOOL] DEADLOCK pass=%d workersRan=%d threadsFinished=%d "
                       "(workers never ran within 12s)",
                       pass, g_workersRan.load(), (int) g_threadsFinished.load() );
            else
                rtlog( "[RTPOOL] PASS done pass=%d workersRan=%d passMs=%ld",
                       pass, g_workersRan.load(), passMs );
        }

        long totalMs = elapsedMs( t0 );
        if( deadlocked )
            rtlog( "[RTPOOL] FAIL deadlocked mode=%d totalMs=%ld", mode, totalMs );
        else
            rtlog( "[RTPOOL] SUCCESS mode=%d workersRan=%d totalMs=%ld sink=%.3f",
                   mode, g_workersRan.load(), totalMs, g_sink.load() );

        releaseParkedPool();

        ( new RtFrame() )->Show();
        return true;
    }
};

wxIMPLEMENT_APP( RtApp );
