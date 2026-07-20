/**
 * wxstring_mt_test.cpp — red/green tests for wxString's UTF-8 build under
 * threads (wxUSE_UNICODE_UTF8).
 *
 * The UTF-8 wxString keeps two pieces of bookkeeping that are updated on
 * read-only access:
 *   - an intrusive list of live iterators (used to fix iterators up when a
 *     width-changing in-place edit shifts the byte buffer), historically
 *     stored INSIDE each string object — so iterating a string SHARED between
 *     threads mutated the shared object without synchronization;
 *   - a per-thread position cache mapping {string address -> char index ->
 *     byte offset}, whose entries can outlive a string destroyed by another
 *     thread and mis-describe a new string reusing the same address.
 *
 * Modes (?m= / #m= — note: `npx serve` cleanUrls drops ?query, use the hash):
 *   0 SHARED-ITER  many threads iterate ONE shared const wxString, holding
 *                  iterators across an opaque call so the registration writes
 *                  cannot be optimized away. RED (traps / wrong derefs) while
 *                  registration lives in the shared string; GREEN with the
 *                  per-thread registry.
 *   1 POSCACHE     cross-thread destroy + same-address realloc stale-hit
 *                  dance. RED while the position cache is enabled under
 *                  threads; GREEN with it disabled (or redesigned).
 *   2 ITER-FIXUP   the feature the iterator registry exists for: in-place
 *                  character assignment that CHANGES the UTF-8 width must fix
 *                  up all live iterators of the same thread. Must be GREEN
 *                  both before and after any registry change.
 *
 * Console contract (asserted by tests/e2e/wxstring-mt.spec.ts):
 *   [WXSTR] START mode=.. threads=..
 *   [WXSTR] SUCCESS mode=.. rounds=..
 *   [WXSTR] CORRUPT ...        (verified wrong value — deterministic detection;
 *                               heap corruption may also surface as a trap)
 */

#include "wx/wx.h"

#include <atomic>
#include <chrono>
#include <cstdarg>
#include <cstdio>
#include <thread>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

using clk = std::chrono::steady_clock;

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

static std::atomic<bool> g_corrupt{ false };

static void corrupt( const char* fmt, ... )
{
    char buf[400];
    va_list ap;
    va_start( ap, fmt );
    vsnprintf( buf, sizeof( buf ), fmt, ap );
    va_end( ap );
    plog( "[WXSTR] CORRUPT %s", buf );
    g_corrupt.store( true );
}

// Opaque boundary: calls through a volatile function pointer cannot be inlined
// or reasoned about, so iterator registration state is observable across them
// and the compiler cannot elide balanced register/unregister pairs (a naive
// tight loop CAN legally be elided — a red test must not rely on one).
static std::atomic<unsigned> g_sink{ 0 };

static void touchIterImpl( wxString::const_iterator& it )
{
    g_sink.fetch_add( ( *it ).GetValue(), std::memory_order_relaxed );
}

typedef void ( *TouchIterFn )( wxString::const_iterator& );
static volatile TouchIterFn g_touchIter = touchIterImpl;

// ---------------------------------------------------------------------------
// mode 0 — concurrent iteration of ONE shared string
// ---------------------------------------------------------------------------

static int modeSharedIter( int seconds )
{
    // Multibyte content so UTF-8 iteration does real decoding work; the
    // expected code points are checked on every deref.
    wxString shared;
    for( int i = 0; i < 48; ++i )
        shared += wxUniChar( 0x3B1 + ( i % 24 ) ); // α..ω repeating

    const size_t nThreads =
            std::max( 4u, std::thread::hardware_concurrency() );

    std::atomic<bool> stop{ false };
    std::atomic<long> rounds{ 0 };
    std::vector<std::thread> threads;

    for( size_t t = 0; t < nThreads; ++t )
    {
        threads.emplace_back( [&, t]()
        {
            size_t off = t % 8;
            while( !stop.load( std::memory_order_relaxed ) )
            {
                // Several iterators alive at once, each surviving an opaque
                // call: every construction/copy/destruction updates the
                // iterator registry.
                wxString::const_iterator a = shared.begin();
                g_touchIter( a );

                wxString::const_iterator b = a;
                for( size_t s = 0; s < 8 + off; ++s )
                    ++b;
                g_touchIter( b );

                wxString::const_iterator c = b;
                ++c;
                g_touchIter( c );

                const unsigned got = ( *b ).GetValue();
                const unsigned want = 0x3B1 + ( ( 8 + off ) % 24 );

                if( got != want )
                {
                    corrupt( "mode=0 deref idx=%zu got=%#x want=%#x round=%ld",
                             8 + off, got, want, rounds.load() );
                    stop.store( true );
                    return;
                }

                off = ( off + 1 ) % 8;
                rounds.fetch_add( 1, std::memory_order_relaxed );
            }
        } );
    }

    clk::time_point t0 = clk::now();
    while( ms( t0 ) < seconds * 1000 && !g_corrupt.load() )
    {
#ifdef __EMSCRIPTEN__
        emscripten_sleep( 20 );
#endif
    }
    stop.store( true );
    for( auto& th : threads )
        th.join();
    return (int) rounds.load();
}

// ---------------------------------------------------------------------------
// mode 1 — position-cache stale hit via cross-thread destroy + address reuse
// ---------------------------------------------------------------------------

static int modePosCache( int seconds )
{
    wxString longStr, shortStr;
    for( int i = 0; i < 64; ++i )
        longStr += wxUniChar( 0x3B1 + ( i % 24 ) );
    for( int i = 0; i < 8; ++i )
        shortStr += wxUniChar( 0x3B1 + ( i % 24 ) );

    std::atomic<wxString*> slot{ nullptr };
    std::atomic<int>       phase{ 0 };
    std::atomic<bool>      stop{ false };
    std::atomic<long>      readerRounds{ 0 };
    std::atomic<int>       inPass{ 0 }; // reader is inside an indexed pass

    std::thread reader( [&]()
    {
        while( !stop.load( std::memory_order_acquire ) )
        {
            if( phase.load( std::memory_order_acquire ) != 0 )
                continue;
            wxString* s = slot.load( std::memory_order_acquire );
            if( !s )
                continue;
            // The controller never frees the published string while a pass is
            // in flight (it waits for inPass == 0 after retracting the slot),
            // so every read below is of a LIVE string — a wrong value can only
            // come from stale cached positions, not from use-after-free.
            inPass.store( 1, std::memory_order_release );
            if( phase.load( std::memory_order_acquire ) != 0
                    || slot.load( std::memory_order_acquire ) != s )
            {
                inPass.store( 0, std::memory_order_release );
                continue;
            }

            // Indexed reads deep into the string populate THIS thread's
            // position cache with (string address -> byte offset) entries.
            size_t len = s->length();
            for( size_t i = len / 2; i < len; ++i )
            {
                unsigned got = ( *s )[i].GetValue();
                unsigned want = 0x3B1 + ( (int) i % 24 );
                if( got != want )
                {
                    corrupt( "mode=1 stale read: len=%zu idx=%zu got=%#x want=%#x",
                             len, i, got, want );
                    stop.store( true );
                    inPass.store( 0, std::memory_order_release );
                    return;
                }
            }
            readerRounds.fetch_add( 1, std::memory_order_relaxed );
            inPass.store( 0, std::memory_order_release );
        }
    } );

    clk::time_point t0 = clk::now();
    int swaps = 0, reuse = 0;
    bool useLong = true;

    while( ms( t0 ) < seconds * 1000 && !g_corrupt.load() )
    {
        wxString* cur = new wxString( useLong ? longStr : shortStr );
        void* prevAddr = (void*) cur;
        slot.store( cur, std::memory_order_release );
        phase.store( 0, std::memory_order_release );
#ifdef __EMSCRIPTEN__
        emscripten_sleep( 5 );
#endif
        // Retract, destroy on THIS thread (only this thread's cache entries
        // are invalidated), reallocate immediately: same-size classes make the
        // allocator hand the address back, and the reader's stale entry now
        // describes a DIFFERENT string.
        phase.store( 1, std::memory_order_release );
        slot.store( nullptr, std::memory_order_release );
        while( inPass.load( std::memory_order_acquire ) != 0 )
        {
#ifdef __EMSCRIPTEN__
            emscripten_sleep( 1 );
#endif
        }
        delete cur;
        useLong = !useLong;
        wxString* next = new wxString( useLong ? longStr : shortStr );
        if( (void*) next == prevAddr )
            ++reuse;
        slot.store( next, std::memory_order_release );
        phase.store( 0, std::memory_order_release );
        ++swaps;
#ifdef __EMSCRIPTEN__
        emscripten_sleep( 5 );
#endif
        phase.store( 1, std::memory_order_release );
        slot.store( nullptr, std::memory_order_release );
        while( inPass.load( std::memory_order_acquire ) != 0 )
        {
#ifdef __EMSCRIPTEN__
            emscripten_sleep( 1 );
#endif
        }
        delete next;
    }
    stop.store( true );
    reader.join();
    plog( "[WXSTR] poscache swaps=%d addrReuse=%d readerRounds=%ld",
          swaps, reuse, readerRounds.load() );
    return swaps;
}

// ---------------------------------------------------------------------------
// mode 2 — iterator fix-up across width-changing in-place edits (the feature
// the registry serves; single-threaded, must ALWAYS pass)
// ---------------------------------------------------------------------------

static int modeIterFixup()
{
    int checks = 0;

    for( int pass = 0; pass < 200; ++pass )
    {
        wxString s = wxString::FromUTF8( "abcdefghij" );

        wxString::iterator       i2 = s.begin() + 2; // 'c', before the edit
        wxString::iterator       i7 = s.begin() + 7; // 'h', after the edit
        wxString::const_iterator c9 = ( (const wxString&) s ).begin() + 9; // 'j'

        // 'e' (1 byte) -> α (2 bytes): width change forces a byte-shifting
        // replace, which must fix up every live iterator of this thread.
        s[4] = wxUniChar( 0x3B1 );

        if( ( *i2 ).GetValue() != 'c' || ( *i7 ).GetValue() != 'h'
                || ( *c9 ).GetValue() != 'j' )
        {
            corrupt( "mode=2 grow fixup: got %#x %#x %#x",
                     ( *i2 ).GetValue(), ( *i7 ).GetValue(), ( *c9 ).GetValue() );
            return checks;
        }

        // α (2 bytes) -> 'e' (1 byte): the shrinking direction.
        s[4] = wxUniChar( 'e' );

        if( ( *i2 ).GetValue() != 'c' || ( *i7 ).GetValue() != 'h'
                || ( *c9 ).GetValue() != 'j' )
        {
            corrupt( "mode=2 shrink fixup: got %#x %#x %#x",
                     ( *i2 ).GetValue(), ( *i7 ).GetValue(), ( *c9 ).GetValue() );
            return checks;
        }

        checks += 6;
    }

    return checks;
}


// ---------------------------------------------------------------------------
// mode 3 — registration liveness for the mode-0 iterator pattern: an iterator
// created and held across the same opaque call must be FIXED UP by a
// width-changing edit — which can only happen if it was registered. Guards
// against the mode-0 red test silently testing nothing (optimizer elision).
// ---------------------------------------------------------------------------
static int modeRegistrationLive()
{
    int checks = 0;

    for( int pass = 0; pass < 100; ++pass )
    {
        wxString s = wxString::FromUTF8( "abcdefghij" );

        wxString::const_iterator a = ( (const wxString&) s ).begin();
        g_touchIter( a );
        wxString::const_iterator b = a;
        for( int i = 0; i < 7; ++i )
            ++b;
        g_touchIter( b ); // 'h', held across the edit below

        s[2] = wxUniChar( 0x3B2 ); // 'c' -> β: width change shifts bytes

        if( ( *b ).GetValue() != 'h' )
        {
            corrupt( "mode=3 iterator NOT fixed up (got %#x) — registration "
                     "was elided; mode 0 would be vacuous", ( *b ).GetValue() );
            return checks;
        }
        checks++;
    }

    return checks;
}


// ---------------------------------------------------------------------------
// mode 4 — shared-string compares alternating with wide-literal conversions.
// CmpNoCase on strings SHARED between threads registers iterator nodes (which
// live on the caller's stack) in the shared string's intrusive list; a torn
// concurrent splice leaves another thread holding a pointer to a node that has
// since died, and its late m_prev write lands in whatever now occupies that
// stack slot. The victim here is deliberate: immediately after the compares,
// the same frame region holds the conversion temporaries of a
// wchar_t* -> wxString construction (vtable-carrying wxMBConv temp) — a stale
// write corrupts its vptr and the virtual dispatch traps. RED while the
// iterator registry lives inside the shared string; GREEN with a per-thread
// registry.
// ---------------------------------------------------------------------------
static int modeCmpThenConvert( int seconds )
{
    std::vector<wxString> names;
    for( int i = 0; i < 6; ++i )
    {
        wxString n;
        n << wxS( "Type_" );
        for( int c = 0; c < 6 + i; ++c )
            n += wxUniChar( 0x3B1 + ( ( i + c ) % 24 ) );
        names.push_back( n );
    }
    const wxString probe = names[3]; // deep copy; compares still iterate BOTH

    static const wchar_t* const wideLits[] = {
        L"NESTED_TABLE_\u03b1\u03b2", L"PCBJAM_FP_\u03b3\u03b4", L"KiCad_\u03b5\u03b6",
    };

    const size_t nThreads = std::max( 4u, std::thread::hardware_concurrency() );
    std::atomic<bool> stop{ false };
    std::atomic<long> rounds{ 0 };
    std::vector<std::thread> threads;

    for( size_t t = 0; t < nThreads; ++t )
    {
        threads.emplace_back( [&, t]()
        {
            size_t k = t;
            while( !stop.load( std::memory_order_relaxed ) )
            {
                // EnumFromStr shape: compare the shared probe against every
                // shared registry name (iterator nodes on THIS stack,
                // registered in the SHARED strings)...
                int hits = 0;
                for( const wxString& n : names )
                {
                    if( n.CmpNoCase( probe ) == 0 )
                        ++hits;
                }

                // ...then immediately build wxStrings from wide literals in
                // the same stack region (the conversion path with the
                // vtable-carrying conv temporary).
                const wchar_t* lit = wideLits[k % 3];
                wxString conv( lit );
                ++k;

                if( hits != 1 || conv.empty() )
                {
                    corrupt( "mode=4 hits=%d convLen=%zu round=%ld",
                             hits, (size_t) conv.length(), rounds.load() );
                    stop.store( true );
                    return;
                }
                rounds.fetch_add( 1, std::memory_order_relaxed );
            }
        } );
    }

    clk::time_point t0 = clk::now();
    while( ms( t0 ) < seconds * 1000 && !g_corrupt.load() )
    {
#ifdef __EMSCRIPTEN__
        emscripten_sleep( 20 );
#endif
    }
    stop.store( true );
    for( auto& th : threads )
        th.join();
    return (int) rounds.load();
}

// ---------------------------------------------------------------------------

class WxStrFrame : public wxFrame
{
public:
    WxStrFrame() : wxFrame( nullptr, wxID_ANY, wxS( "wxstring-mt" ), wxDefaultPosition,
                            wxSize( 320, 120 ) )
    {
    }
};

class WxStrApp : public wxApp
{
public:
    bool OnInit() override
    {
        const int mode = readMode();
        plog( "[WXSTR] START mode=%d threads=%u", mode,
              std::thread::hardware_concurrency() );

        clk::time_point t0 = clk::now();
        int rounds = 0;
        const int seconds = 15;

        switch( mode )
        {
        case 0: rounds = modeSharedIter( seconds ); break;
        case 1: rounds = modePosCache( seconds ); break;
        case 2: rounds = modeIterFixup(); break;
        case 3: rounds = modeRegistrationLive(); break;
        case 4: rounds = modeCmpThenConvert( seconds ); break;
        default: plog( "[WXSTR] unknown mode=%d", mode ); break;
        }

        if( !g_corrupt.load() )
            plog( "[WXSTR] SUCCESS mode=%d rounds=%d totalMs=%ld", mode, rounds, ms( t0 ) );

        ( new WxStrFrame() )->Show();
        return true;
    }
};

wxIMPLEMENT_APP( WxStrApp );
