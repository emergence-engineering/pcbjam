/**
 * pthread_ondemand_test.cpp
 *
 * Phase 2: can a NON-warm (on-demand) Worker be spawned WITHOUT modifying KiCad?
 *
 * Faithful shape of the real raytracer's deadlock: the REAL KiCad pool (compiled-in
 * kicad/common/thread_pool.cpp, via GetKiCadThreadPool()) consumes ALL the pre-warmed
 * Workers at construction. We then spawn raw std::thread fly-threads BEYOND that count,
 * which must be created ON DEMAND. Finalizing an on-demand Worker needs the main event
 * loop to run the new-Worker 'loaded'->'run' handshake.
 *
 *   m=0 control : a main-thread busy-wait join that does NOT call nanosleep -> never
 *                 returns to the event loop -> the on-demand Workers never boot ->
 *                 DEADLOCK (workersRan=0; self-recovers after a 12s cap).
 *   m=1 fix     : join via std::this_thread::sleep_for -> nanosleep, which (via
 *                 wasm/shims/nanosleep_yield.c, a strong nanosleep override) Asyncify-yields on
 *                 the main thread -> the event loop services the handshake -> the
 *                 on-demand Workers boot -> multi-core (workersRan>1). No KiCad edit.
 *
 * The override only affects main-thread nanosleep; a worker keeps a real blocking sleep.
 *
 * Console contract (the spec asserts on these):
 *   [ONDEMAND] START m=.. poolThreads=.. extra=.. hwc=..
 *   [ONDEMAND] SUCCESS m=.. workersRan=.. totalMs=..   (workersRan=0 for m=0, the deadlock)
 *   [ONDEMAND] DEADLOCK m=0: ...
 */

#include "wx/wx.h"

#include <thread_pool.h> // kicad/include/thread_pool.h -> GetKiCadThreadPool()

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdarg>
#include <cstdio>
#include <thread>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

using clk = std::chrono::steady_clock;

static void olog( const char* fmt, ... )
{
    char buf[512];
    va_list ap;
    va_start( ap, fmt );
    vsnprintf( buf, sizeof( buf ), fmt, ap );
    va_end( ap );
#ifdef __EMSCRIPTEN__
    EM_ASM( { console.log( UTF8ToString( $0 ) ); }, buf );
#else
    printf( "%s\n", buf );
#endif
}

static int readMode()
{
#ifdef __EMSCRIPTEN__
    return EM_ASM_INT( {
        var raw = location.search ? location.search.slice( 1 ) : location.hash.slice( 1 );
        var v = parseInt( new URLSearchParams( raw ).get( 'm' ), 10 );
        return isNaN( v ) ? 1 : v;
    } );
#else
    return 1;
#endif
}

static long ms( clk::time_point t0 )
{
    return (long) std::chrono::duration_cast<std::chrono::milliseconds>( clk::now() - t0 ).count();
}

// shared work: raw fly-threads cooperatively drain a global atomic block counter.
static std::atomic<size_t> g_nextBlock{ 0 };
static std::atomic<size_t> g_threadsFinished{ 0 };
static std::atomic<int>    g_workersRan{ 0 };
static std::atomic<double> g_sink{ 0.0 };
static int                 g_numBlocks = 48;
static long                g_iters = 3000000;

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
    for( size_t b = g_nextBlock.fetch_add( 1 ); b < (size_t) g_numBlocks; b = g_nextBlock.fetch_add( 1 ) )
    {
        if( !counted )
        {
            g_workersRan.fetch_add( 1 );
            counted = true;
        }
        g_sink.store( g_sink.load( std::memory_order_relaxed ) + computeBlock( (int) b, g_iters ),
                      std::memory_order_relaxed );
    }
    g_threadsFinished.fetch_add( 1 );
}

class OndemandFrame : public wxFrame
{
public:
    OndemandFrame() : wxFrame( nullptr, wxID_ANY, "On-demand Worker Test",
                               wxDefaultPosition, wxSize( 420, 140 ) )
    {
        wxPanel* p = new wxPanel( this );
        wxBoxSizer* s = new wxBoxSizer( wxVERTICAL );
        s->Add( new wxStaticText( p, wxID_ANY, "On-demand non-warm Worker test — see console." ),
                0, wxALL, 16 );
        p->SetSizer( s );
    }
};

class OndemandApp : public wxApp
{
public:
    bool OnInit() override
    {
        const int hwc = std::max( 1u, std::thread::hardware_concurrency() );
        const int mode = readMode();
        const int extra = 4; // raw fly-threads BEYOND the pool -> must be created on demand

        // Consume ALL pre-warmed Workers with the REAL KiCad pool — exactly like KiCad does.
        // (PTHREAD_POOL_SIZE = hardware_concurrency, the pool takes them all at construction,
        // so the `extra` raw threads below force on-demand Worker creation.)
        thread_pool& tp = GetKiCadThreadPool();
        olog( "[ONDEMAND] START m=%d poolThreads=%u extra=%d hwc=%d",
              mode, (unsigned) tp.get_thread_count(), extra, hwc );

        g_nextBlock.store( 0 );
        g_threadsFinished.store( 0 );
        g_workersRan.store( 0 );
        auto t0 = clk::now();

        for( int i = 0; i < extra; ++i )
            std::thread( workerBody ).detach();

        if( mode == 0 )
        {
            // control: busy-wait WITHOUT nanosleep -> never yields -> on-demand never boots.
            auto dl = clk::now();
            while( g_threadsFinished.load() < (size_t) extra )
            {
                for( volatile int s = 0; s < 200000; ++s )
                    ; // pure spin: no sleep_for / nanosleep, so it does not hit the override
                if( std::chrono::duration_cast<std::chrono::seconds>( clk::now() - dl ).count() >= 12 )
                {
                    olog( "[ONDEMAND] DEADLOCK m=0: on-demand workers never booted within 12s "
                          "(busy-wait starved the event loop)" );
                    break;
                }
            }
        }
        else
        {
            // fix: sleep_for -> nanosleep -> (overridden) Asyncify yield -> main pumps the
            // new-Worker handshake -> the on-demand Workers boot and run.
            while( g_threadsFinished.load() < (size_t) extra )
                std::this_thread::sleep_for( std::chrono::milliseconds( 10 ) );
        }

        olog( "[ONDEMAND] SUCCESS m=%d workersRan=%d totalMs=%ld sink=%.3f",
              mode, g_workersRan.load(), ms( t0 ), g_sink.load() );
        ( new OndemandFrame() )->Show();
        return true;
    }
};

wxIMPLEMENT_APP( OndemandApp );
