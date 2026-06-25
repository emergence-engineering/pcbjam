/**
 * threadpool_real_test.cpp
 *
 * The BS-pool-API native-EH test (docs/features/wasm-exceptions/10 §6 #1).
 *
 * Unlike threadpool_test / raytrace_threads_test (which hand-roll raw std::thread),
 * this app drives KiCad's REAL pool: it compiles kicad/common/thread_pool.cpp and
 * calls the actual GetKiCadThreadPool() (a BS::priority_thread_pool). The pool's
 * detach_task __EMSCRIPTEN__ inline shim is opted OUT here via -DKICAD_WASM_REAL_THREADPOOL
 * so tasks actually run on the pool's persistent pthread workers.
 *
 * WHY this is the decisive test: the real pool is mode-a/b-safe by construction —
 * its workers are PERSISTENT (created at pool construction, consuming the pre-warmed
 * pool, so no on-demand spawn → no deadlock) and its main-side join is a futex
 * busy-wait, not emscripten_sleep (→ no Asyncify nesting). The ONLY native-EH risk is
 * mode-c: a task that THROWS on a worker (caught by submit_task's promise wrapper ON the
 * worker drives Asyncify under -fexceptions → "func is not a function"). Native wasm-EH
 * decouples exceptions from Asyncify and should make it safe. So:
 *   - modes submit/loop/blocks/detach/fanout/lifecycle prove real multi-core (workersRan>1)
 *   - mode throw is the mode-c / native-EH proof (red under JS-EH, green under native-EH)
 * Green here ⇒ we can drop the detach_task shim for every pool consumer.
 *
 * Pure-compute tasks only (no JS/DOM/async-IO on a worker) — exactly why the real
 * pool's tasks are safe to run off the main thread.
 *
 * URL: ?m=0 submit | 1 loop | 2 blocks | 3 detach | 4 fanout | 5 lifecycle | 6 throw
 *      (read from location.search OR the #fragment — serve-handler cleanUrls drops ?query)
 *
 * Console contract (the Playwright spec asserts on these):
 *   [POOL] START mode=.. threads=..
 *   [POOL] SUCCESS mode=.. workersRan=.. totalMs=.. sink=..
 *   [POOL] SUCCESS mode=6 threw=1 caught=.. workersRan=.. ...   (the throw / mode-c proof)
 */

#include "wx/wx.h"

#include <thread_pool.h> // kicad/include/thread_pool.h -> GetKiCadThreadPool() + BS::*

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <future>
#include <optional>
#include <stdexcept>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

using clk = std::chrono::steady_clock;

// ---------------------------------------------------------------------------
static void plog( const char* fmt, ... )
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
        return isNaN( v ) ? 0 : v;
    } );
#else
    return 0;
#endif
}

static long ms( clk::time_point t0 )
{
    return (long) std::chrono::duration_cast<std::chrono::milliseconds>( clk::now() - t0 ).count();
}

// ---------------------------------------------------------------------------
// shared work: pure CPU math; each task records WHICH pool worker ran it so we can
// prove real parallelism (distinct BS::this_thread::get_index() values).
// ---------------------------------------------------------------------------
static std::atomic<uint64_t> g_workerMask{ 0 };
static std::atomic<double>   g_sink{ 0.0 };

static void recordWorker()
{
    std::optional<std::size_t> idx = BS::this_thread::get_index();
    if( idx )
        g_workerMask.fetch_or( 1ull << ( *idx & 63 ), std::memory_order_relaxed );
}

static double computeBlock( int b, long iters )
{
    double acc = 0.0;
    for( long i = 0; i < iters; ++i )
        acc += std::sin( (double) ( b * 131 + i ) * 1e-6 ) * std::cos( (double) i * 1e-7 );
    return acc;
}

static int workersRan()
{
    return __builtin_popcountll( g_workerMask.load() );
}

static constexpr int  N = 64;
static constexpr long ITERS = 2000000;

static void addWork( int b, long iters )
{
    recordWorker();
    g_sink.store( g_sink.load( std::memory_order_relaxed ) + computeBlock( b, iters ),
                  std::memory_order_relaxed );
}

// ---------------------------------------------------------------------------
class PoolFrame : public wxFrame
{
public:
    PoolFrame() : wxFrame( nullptr, wxID_ANY, "Real Thread Pool Test",
                           wxDefaultPosition, wxSize( 420, 140 ) )
    {
        wxPanel* p = new wxPanel( this );
        wxBoxSizer* s = new wxBoxSizer( wxVERTICAL );
        s->Add( new wxStaticText( p, wxID_ANY, "Real GetKiCadThreadPool() test — see console." ),
                0, wxALL, 16 );
        p->SetSizer( s );
    }
};

class PoolApp : public wxApp
{
public:
    bool OnInit() override
    {
        const int mode = readMode();
        thread_pool& tp = GetKiCadThreadPool(); // the REAL BS::priority_thread_pool
        plog( "[POOL] START mode=%d threads=%u", mode, (unsigned) tp.get_thread_count() );
        // Report the exception model so the spec can gate the mode-c (throw-on-worker) test:
        // a worker throw is only safe under native wasm-EH (-fwasm-exceptions defines this).
#ifdef __WASM_EXCEPTIONS__
        plog( "[POOL] EH=native" );
#else
        plog( "[POOL] EH=js" );
#endif

        g_workerMask.store( 0 );
        g_sink.store( 0.0 );
        auto t0 = clk::now();

        switch( mode )
        {
        case 0: // submit_task + vector<future> + 250ms poll loop (the DRC/connectivity idiom)
        {
            std::vector<std::future<void>> futs;
            for( int i = 0; i < N; ++i )
                futs.push_back( tp.submit_task( [i] { addWork( i, ITERS ); } ) );
            for( auto& f : futs )
                while( f.wait_for( std::chrono::milliseconds( 250 ) ) != std::future_status::ready )
                    ;
            break;
        }
        case 1: // submit_loop -> multi_future.wait()
        {
            BS::multi_future<void> mf = tp.submit_loop( 0, N, [] ( int i ) { addWork( i, ITERS ); } );
            mf.wait();
            break;
        }
        case 2: // submit_blocks (each block returns a value)
        {
            BS::multi_future<double> mf = tp.submit_blocks(
                    0, N,
                    [] ( int s, int e )
                    {
                        recordWorker();
                        double a = 0.0;
                        for( int i = s; i < e; ++i )
                            a += computeBlock( i, ITERS );
                        return a;
                    } );
            double total = 0.0;
            for( auto& f : mf )
                if( f.valid() )
                    total += f.get();
            g_sink.store( g_sink.load() + total );
            break;
        }
        case 3: // detach_task fire-and-forget + tp.wait()
        {
            for( int i = 0; i < N; ++i )
                tp.detach_task( [i] { addWork( i, ITERS ); } );
            tp.wait();
            break;
        }
        case 4: // manual multi_future fanned out by get_thread_count() (the renderTracing shape)
        {
            std::atomic<int>       next{ 0 };
            BS::multi_future<void> mf;
            auto                   proc = [&next]
            {
                for( int b = next.fetch_add( 1 ); b < N; b = next.fetch_add( 1 ) )
                    addWork( b, ITERS );
            };
            for( std::size_t i = 0; i < tp.get_thread_count(); ++i )
                mf.push_back( tp.submit_task( proc ) );
            mf.wait();
            break;
        }
        case 5: // lifecycle + features: queries / purge / reset + pause via a pause_thread_pool
        {
            plog( "[POOL] tasks queued=%zu running=%zu total=%zu threads=%zu",
                  tp.get_tasks_queued(), tp.get_tasks_running(), tp.get_tasks_total(),
                  (std::size_t) tp.get_thread_count() );
            tp.wait();
            tp.purge();

            // pause/unpause are compiled OUT on the priority pool, so exercise them on a
            // small pause_thread_pool (the +2 PTHREAD_POOL_SIZE headroom pre-warms its workers).
            BS::pause_thread_pool pp( 2 );
            pp.pause();
            for( int i = 0; i < 8; ++i )
                pp.detach_task( [] {} );
            const bool        paused = pp.is_paused();
            const std::size_t queued = pp.get_tasks_queued();
            pp.unpause();
            pp.wait();
            plog( "[POOL] pause: is_paused=%d queuedWhilePaused=%zu", paused ? 1 : 0, queued );

            // and a real parallel batch so workersRan>1 holds for this mode too
            tp.submit_loop( 0, N, [] ( int i ) { addWork( i, ITERS / 4 ); } ).wait();
            break;
        }
        case 6: // throw ON a worker -> rethrow on main. THE mode-c / native-EH proof.
        {
            int  caught = 0;
            auto f = tp.submit_task( [] () -> int
                                     {
                                         recordWorker();
                                         throw std::runtime_error( "boom-on-worker" );
                                         return 0;
                                     } );
            try
            {
                (void) f.get();
            }
            catch( const std::exception& e )
            {
                caught = 1;
                plog( "[POOL] caught on main: %s", e.what() );
            }
            // and prove workers still run a normal batch after the throw
            tp.submit_loop( 0, N, [] ( int i ) { addWork( i, ITERS / 4 ); } ).wait();
            plog( "[POOL] SUCCESS mode=6 threw=1 caught=%d workersRan=%d totalMs=%ld sink=%.3f",
                  caught, workersRan(), ms( t0 ), g_sink.load() );
            ( new PoolFrame() )->Show();
            return true;
        }
        default:
            plog( "[POOL] unknown mode=%d", mode );
            break;
        }

        plog( "[POOL] SUCCESS mode=%d workersRan=%d totalMs=%ld sink=%.3f",
              mode, workersRan(), ms( t0 ), g_sink.load() );
        ( new PoolFrame() )->Show();
        return true;
    }
};

wxIMPLEMENT_APP( PoolApp );
