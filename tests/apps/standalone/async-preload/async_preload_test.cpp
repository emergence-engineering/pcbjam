/**
 * async_preload_test.cpp
 *
 * Standalone repro of KiCad-10's library-preload SHAPE (docs/features/wasm-exceptions/10 §7) —
 * NOT using real KiCad/pcbnew. Proves native wasm-EH makes the shape safe.
 *
 * The shape (mirrors kicad/eeschema/sch_io/pcbjam_lib/sch_io_pcbjam_lib.cpp):
 *   - a std::async(std::launch::async, …) background worker (NOT the thread pool) that, per
 *     "library", PROXIES a fetch to the main thread (emscripten_proxy_sync_with_ctx) and then
 *     PARSES the bytes on the worker — the parse THROWS an IO_ERROR-like exception (the "mode-c"
 *     trigger: a throw caught ON a worker drives Asyncify under -fexceptions → crash; native
 *     wasm-EH decouples it → safe).
 *   - a LAZY join: main keeps the std::future alive and never blocks in normal operation, so it
 *     stays in its event loop to service the worker's proxied fetches.
 *   - a g_proxyMutex serializes worker→main proxy round-trips (the real "table index out of
 *     bounds" reentrancy guard when main is asyncify-suspended in a modal).
 *
 * (Simplification vs real KiCad: the proxied fetch finishes synchronously in the handler — the real
 * one kicks an async JS promise + finishes from its callback. We keep the round-trip + the
 * serialization, which is what the reentrancy hazard and the mode-c throw need; the throw is on the
 * worker's parse, independent of the fetch being sync/async.)
 *
 * URL ?m=0 simple | 1 throw (parse throws → caught on worker, no mode-c crash) |
 *         2 shutdown (main blocking-joins the future mid-load) | 3 modal (a modal opens while
 *         workers proxy → g_proxyMutex must prevent a reentrancy crash)
 *
 * Console contract:
 *   [PRELOAD] START m=..      [PRELOAD] EH=native|js
 *   [PRELOAD] SUCCESS m=.. caught=.. loaded=..
 */

#include "wx/wx.h"

#include <atomic>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <future>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#include <emscripten/proxying.h>
#include <emscripten/threading.h>
#endif

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

static void mainSleep( int ms )
{
#ifdef __EMSCRIPTEN__
    emscripten_sleep( ms ); // Asyncify yield → main's event loop runs (services the proxy queue)
#else
    std::this_thread::sleep_for( std::chrono::milliseconds( ms ) );
#endif
}

// ---------------------------------------------------------------------------
// the proxied "fetch": worker → main round-trip (mirrors the PCBJAM bridge)
// ---------------------------------------------------------------------------
static std::mutex g_proxyMutex;

#ifdef __EMSCRIPTEN__
extern "C" EMSCRIPTEN_KEEPALIVE void preload_finish( em_proxying_ctx* ctx )
{
    emscripten_proxy_finish( ctx );
}

static void proxy_fetch_on_main( em_proxying_ctx* ctx, void* )
{
    // Runs on the MAIN thread via the system proxying queue. Synchronous finish (see header note).
    preload_finish( ctx );
}
#endif

static std::string proxyFetchToMain( const std::string& lib )
{
#ifdef __EMSCRIPTEN__
    if( emscripten_is_main_runtime_thread() )
        return "(mock " + lib + ")"; // main path (not exercised here; the preload runs on a worker)

    std::lock_guard<std::mutex> serialize( g_proxyMutex );
    em_proxying_queue* q = emscripten_proxy_get_system_queue();
    if( !emscripten_proxy_sync_with_ctx( q, emscripten_main_runtime_thread_id(),
                                         proxy_fetch_on_main, nullptr ) )
        return "";
#endif
    return "(mock " + lib + ")";
}

// ---------------------------------------------------------------------------
class IO_ERROR : public std::runtime_error
{
public:
    explicit IO_ERROR( const std::string& m ) : std::runtime_error( m ) {}
};

static std::size_t parseLib( const std::string& data, bool shouldThrow )
{
    if( shouldThrow )
        throw IO_ERROR( "simulated S-expr parse failure" ); // the mode-c trigger
    return data.find( "mock" ) != std::string::npos ? 1u : 0u;
}

// ---------------------------------------------------------------------------
static std::atomic<bool> g_caught{ false };
static std::atomic<int>  g_loaded{ 0 };
static std::atomic<bool> g_done{ false };
static std::atomic<bool> g_abort{ false };
static std::future<void> g_future; // kept alive => LAZY join (dtor blocks only at teardown)

static void preloadRun( bool throwOnParse )
{
    try
    {
        std::this_thread::sleep_for( std::chrono::milliseconds( 20 ) ); // worker-side watchdog
        for( const char* lib : { "lib_a", "lib_b", "lib_c" } )
        {
            if( g_abort.load() )
                break; // the CancelPreload mitigation: bail before the next proxy
            std::string data = proxyFetchToMain( lib );   // proxy the fetch to main
            g_loaded.fetch_add( (int) parseLib( data, throwOnParse ) ); // parse ON the worker (throws)
        }
    }
    catch( const std::exception& e )
    {
        g_caught.store( true );
        plog( "[PRELOAD] worker caught: %s", e.what() );
    }
    g_done.store( true );
}

// ---------------------------------------------------------------------------
// minimal auto-closing modal (timer armed before ShowModal; closes itself)
// ---------------------------------------------------------------------------
static constexpr int ID_MODAL_CLOSE = wxID_HIGHEST + 700;

class AutoCloseDialog : public wxDialog
{
public:
    AutoCloseDialog( wxWindow* parent, int delayMs ) :
            wxDialog( parent, wxID_ANY, "preload-modal", wxDefaultPosition, wxSize( 280, 120 ) ),
            m_timer( this, ID_MODAL_CLOSE )
    {
        Bind( wxEVT_SHOW, &AutoCloseDialog::OnShow, this );
        Bind( wxEVT_TIMER, [this] ( wxTimerEvent& ) { plog( "[PRELOAD] modal: close-timer fired" ); EndModal( wxID_OK ); }, ID_MODAL_CLOSE );
        m_delayMs = delayMs;
    }

private:
    void OnShow( wxShowEvent& e )
    {
        if( e.IsShown() )
        {
            plog( "[PRELOAD] modal: shown, arming %dms auto-close", m_delayMs );
            m_timer.StartOnce( m_delayMs );
        }
        e.Skip();
    }
    wxTimer m_timer;
    int     m_delayMs = 300;
};

// ---------------------------------------------------------------------------
static constexpr int ID_SCENARIO_TIMER = wxID_HIGHEST + 701;

class PreloadFrame : public wxFrame
{
public:
    PreloadFrame() : wxFrame( nullptr, wxID_ANY, "Async Preload Test",
                              wxDefaultPosition, wxSize( 420, 140 ) ),
                     m_scenarioTimer( this, ID_SCENARIO_TIMER )
    {
        wxPanel* p = new wxPanel( this );
        wxBoxSizer* s = new wxBoxSizer( wxVERTICAL );
        s->Add( new wxStaticText( p, wxID_ANY, "std::async library-preload repro — see console." ),
                0, wxALL, 16 );
        p->SetSizer( s );
        Bind( wxEVT_TIMER, &PreloadFrame::OnScenario, this, ID_SCENARIO_TIMER );
    }

    void armModalScenario() { m_scenarioTimer.StartOnce( 50 ); }

private:
    // Runs INSIDE the main event loop (the modal pump needs that — ShowModal straight from OnInit,
    // before the loop starts, hangs). Several workers each do a bounded series of worker->main proxy
    // round-trips with a small gap so the modal pump can dispatch its auto-close timer; g_proxyMutex
    // serializes them, preventing concurrent C reentry into the asyncify-suspended (modal) main.
    void OnScenario( wxTimerEvent& )
    {
        std::atomic<int>         rounds{ 0 };
        std::vector<std::thread> workers;
        for( int i = 0; i < 3; ++i )
            workers.emplace_back( [&rounds]
            {
                for( int k = 0; k < 12; ++k )
                {
                    proxyFetchToMain( "spam" );
                    rounds.fetch_add( 1 );
                    std::this_thread::sleep_for( std::chrono::milliseconds( 10 ) );
                }
            } );

        plog( "[PRELOAD] modal: workers spawned, showing modal" );
        AutoCloseDialog dlg( this, 300 );
        dlg.ShowModal();
        plog( "[PRELOAD] modal: ShowModal returned (rounds=%d)", rounds.load() );

        for( auto& t : workers )
            t.join();
        plog( "[PRELOAD] SUCCESS m=3 caught=0 loaded=0 proxyRounds=%d", rounds.load() );
    }

    wxTimer m_scenarioTimer;
};

class PreloadApp : public wxApp
{
public:
    bool OnInit() override
    {
        const int mode = readMode();
        plog( "[PRELOAD] START m=%d", mode );
#ifdef __WASM_EXCEPTIONS__
        plog( "[PRELOAD] EH=native" );
#else
        plog( "[PRELOAD] EH=js" );
#endif
        g_caught.store( false );
        g_loaded.store( 0 );
        g_done.store( false );
        g_abort.store( false );

        PreloadFrame* frame = new PreloadFrame();
        frame->Show();

        if( mode == 3 )
        {
            frame->armModalScenario(); // runs in the main loop; logs its own [PRELOAD] SUCCESS m=3
            return true;
        }

        const bool throwOnParse = ( mode == 1 );
        g_future = std::async( std::launch::async, [throwOnParse] { preloadRun( throwOnParse ); } );

        if( mode == 2 ) // shutdown: blocking-join the future mid-load (synchronous proxies complete
                        // during the futex busy-wait's queue processing)
        {
            mainSleep( 30 );
            g_abort.store( true );
            g_future.wait();
            plog( "[PRELOAD] shutdown joined" );
        }
        else // simple / throw: LAZY join — poll via emscripten_sleep, main stays live
        {
            for( int i = 0; i < 200 && !g_done.load(); ++i )
                mainSleep( 20 );
        }

        plog( "[PRELOAD] SUCCESS m=%d caught=%d loaded=%d",
              mode, g_caught.load() ? 1 : 0, g_loaded.load() );
        return true;
    }
};

wxIMPLEMENT_APP( PreloadApp );
