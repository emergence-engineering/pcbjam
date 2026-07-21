/*
 * Shared plumbing for the per-editor collab binding TUs (eeschema_embind.cpp,
 * pcbnew_embind.cpp) — the frame-type-free half of the bridge: string/JSON
 * wire emitters to window.kicadCollab, the CallAfter+COROUTINE fiber idiom,
 * and the frame-generic test hooks. Header-only (the collab_presence_style.h
 * pattern), so the build script needs no extra objects and the merged
 * kicad_editor image links it without ODR issues.
 */

#pragma once

#ifdef __EMSCRIPTEN__

#include <deque>
#include <emscripten.h>
#include <functional>
#include <string>
#include <nlohmann/json.hpp>
#include <wx/event.h>
#include <wx/string.h>
#include <eda_base_frame.h>
#include <tool/actions.h>
#include <tool/coroutine.h>
#include <tool/tool_manager.h>

namespace pcbjam_collab {

inline std::string toUtf8( const wxString& s ) { return std::string( s.utf8_str() ); }

/**
 * Run a body on the editor's main loop AND on a libcontext fiber stack — the
 * exact context native tool edits run in. Embind ccalls / bare CallAfter
 * stacks mis-dispatch asyncify-instrumented virtual calls (invoke_* through a
 * stale table type traps, or silently no-ops); commits, GAL overlay work and
 * the s-expr formatters must therefore run through this. CallAfter queues
 * onto the app's pending-event list (drained every frame by the wasm main
 * loop, src/wasm/evtloop.cpp); COROUTINE::Call moves the body to the fiber.
 *
 * SERIALIZED (drift-trio finding #10, standalone-hardening 0008 §10): bodies
 * run strictly one-at-a-time through a FIFO. The previous per-body
 * fire-and-forget coroutine interleaved under load: when a body PARKED
 * (asyncify suspension inside commit.Push — connectivity/GAL work), the main
 * loop kept draining pending events and started the NEXT body — a local
 * commit and a remote apply then ran interleaved on shared commit/listener
 * state (s_applyingRemote is a single global), silently losing applies on the
 * actively-editing receiver and, in the worst case, corrupting memory (fuzz
 * S10: wasm OOB on an observer). The busy flag is park-safe: an asyncify
 * suspension suspends the whole drain loop with the body and rewinds it
 * transparently, while any other drain invocation no-ops on the flag; the
 * suspended drain's own while-loop picks up whatever queued meanwhile.
 */
inline std::deque<std::function<void()>>& fiberQueue()
{
    static std::deque<std::function<void()>> q;
    return q;
}

inline bool& fiberBusy()
{
    static bool busy = false;
    return busy;
}

inline void drainFibers()
{
    if( fiberBusy() )
        return;             // the running drain's while-loop covers the rest

    auto& q = fiberQueue();

    while( !q.empty() )
    {
        fiberBusy() = true;

        std::function<void()> body = std::move( q.front() );
        q.pop_front();

        COROUTINE<int, int> cor( [&body]( int ) -> int
                                 {
                                     body();
                                     return 0;
                                 } );
        cor.Call( 0 );
        fiberBusy() = false;
    }
}

inline void runOnFiber( wxEvtHandler* aHandler, std::function<void()> aBody )
{
    fiberQueue().push_back( std::move( aBody ) );
    aHandler->CallAfter( []() { drainFibers(); } );
}

// ── C++ → JS wire emitters (no-ops without a JS listener) ───────────────────

/** Legacy scalar delta wire: window.kicadCollab.onDelta. */
inline void emitDelta( const nlohmann::json& aDelta )
{
    std::string s = aDelta.dump();
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onDelta )
            window.kicadCollab.onDelta( UTF8ToString( $0 ) );
    }, s.c_str() );
}

/** v2 per-item s-expr blob wire (ysync 0008): window.kicadCollab.onItems. */
inline void emitItemsWire( const nlohmann::json& aWire )
{
    std::string s = aWire.dump();
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onItems )
            window.kicadCollab.onItems( UTF8ToString( $0 ) );
    }, s.c_str() );
}

/** Local cursor position (presence): window.kicadCollab.onCursor. */
inline void emitCursor( double aX, double aY, bool aActive )
{
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onCursor )
            window.kicadCollab.onCursor( $0, $1, $2 );
    }, aX, aY, aActive ? 1 : 0 );
}

/** Local selection payload (presence): window.kicadCollab.onSelection. */
inline void emitSelection( const std::string& aJson )
{
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onSelection )
            window.kicadCollab.onSelection( UTF8ToString( $0 ) );
    }, aJson.c_str() );
}

/** Viewport transform for the DOM layers (0005): window.kicadCollab.onViewport. */
inline void emitViewport( double aCx, double aCy, double aPxPerIu, int aW, int aH )
{
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onViewport )
            window.kicadCollab.onViewport( $0, $1, $2, $3, $4 );
    }, aCx, aCy, aPxPerIu, aW, aH );
}

// ── frame-generic test hooks (ysync miss 09) ────────────────────────────────

/** Run Edit>Undo exactly like the UI would (main-loop + fiber stack) —
 *  exercises the local-ops-only undo policy and the stale-picker UUID guard. */
inline bool testUndo( EDA_BASE_FRAME* aFrame )
{
    if( !aFrame )
        return false;

    runOnFiber( aFrame, [aFrame]() { aFrame->GetToolManager()->RunAction( ACTIONS::undo ); } );
    return true;
}

/** Local undo stack depth — remote applies must not grow it (miss 09). */
inline int testUndoDepth( EDA_BASE_FRAME* aFrame )
{
    return aFrame ? aFrame->GetUndoCommandCount() : -1;
}

} // namespace pcbjam_collab

#endif // __EMSCRIPTEN__
