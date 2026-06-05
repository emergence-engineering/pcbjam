/*
 * Embind bindings for KiCad WASM
 * Exposes core PCBnew objects to JavaScript
 *
 * This provides a foundation for future Pyodide integration.
 *
 * Note: GetBoard() is not available when KICAD_SCRIPTING=OFF.
 * These bindings expose the classes for use when a board reference
 * is obtained through other means (e.g., from the UI).
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/bind.h>
#include <board.h>
#include <board_commit.h>
#include <board_item.h>
#include <footprint.h>
#include <pad.h>
#include <pcb_track.h>
#include <pcb_group.h>
#include <zone.h>
#include <pcb_edit_frame.h>
#include <kiway_player.h>
#include <kiway.h>
#include <kiid.h>
#include <layer_ids.h>
#include <tool/coroutine.h>
#include <nlohmann/json.hpp>
#include <map>
#include <set>
#include <string>
#include <vector>
#include <wx/app.h>
#include <wx/string.h>
#include <wx/window.h>

using namespace emscripten;
using json = nlohmann::json;

// Programmatically open a project file (board/schematic) in the running editor
// frame, without UI automation. Mirrors single_top.cpp's MacOpenFile path:
// the editor frame is the app's top window and is a KIWAY_PLAYER. Returns the
// result of OpenProjectFiles, or false if no frame is available — letting the
// JS caller fall back to driving File→Open.
bool kicadOpenFile( std::string path )
{
    KIWAY_PLAYER* frame =
            wxTheApp ? static_cast<KIWAY_PLAYER*>( wxTheApp->GetTopWindow() ) : nullptr;

    if( !frame )
        return false;

    if( wxWindow* blocking = frame->Kiway().GetBlockingDialog() )
        blocking->Close( true );

    return frame->OpenProjectFiles(
            std::vector<wxString>( 1, wxString::FromUTF8( path.c_str() ) ) );
}

// ───────────────────────────── Yjs collaborative bridge ─────────────────────────────
//
// pcbnew's half of the unified bridge contract (features/yjs-bridge 0001, 0004). Like
// eeschema it needs NO kicad-fork change: BOARD_ITEM already carries a stable KIID, and
// pcbnew has native change machinery, so the adapter is a thin re-use of public API:
//   ChangeSource (emit) = a BOARD_LISTENER subclass (BOARD_COMMIT::Push fires it)
//   apply              = BOARD_COMMIT Add/Modify/Remove + Push (drives connectivity +
//                        ratsnest recompute — mandatory on pcbnew, 0004 §apply)
// The generic JS reconciler / transport / WasmTool wiring are reused unchanged, and the
// emit/apply structure mirrors the (battle-tested) eeschema bridge:
//   - emit  = a POST-SETTLE snapshot DIFF (the listener is just a "something changed"
//             trigger; the real change set is a diff of the full model taken after the
//             edit's BOARD_COMMIT::Push — connectivity cleanup included — has returned,
//             so peers converge by re-applying already-clean geometry). See eeschema 0007.
//   - apply = BOARD_COMMIT run inside a CallAfter + COROUTINE fiber stack, the exact
//             context native tool edits run in, so GAL view->Add of a freshly-constructed
//             item dispatches its asyncify-instrumented virtuals correctly (eeschema 0007).
//
// Scope of this first commit (0004 §"first PoC", matching eeschema commit-3's first cut):
// position/geometry sync of existing items — changed (move/reshape) and removed work for
// ANY top-level item by uuid; `added` reconstructs PCB_TRACK segments natively. Footprint/
// via/zone `added` (which need a library or the s-expr clipboard blob, same class as the
// deferred SCH_SYMBOL add) are logged + skipped until a later commit. Net assignment +
// ratsnest are recomputed by BOARD_COMMIT::Push regardless.
namespace {

// Guard so BOARD_COMMIT::Push's listener callbacks during apply() aren't re-emitted.
bool s_applyingRemote = false;

std::string toUtf8( const wxString& s ) { return std::string( s.utf8_str() ); }

PCB_EDIT_FRAME* pcbFrame()
{
    return wxTheApp ? dynamic_cast<PCB_EDIT_FRAME*>( wxTheApp->GetTopWindow() ) : nullptr;
}

bool isTrackType( KICAD_T t )
{
    return t == PCB_TRACE_T || t == PCB_ARC_T || t == PCB_VIA_T;
}

// Iterate every TOP-LEVEL board item (tracks, footprints, drawings, zones, groups). Footprint
// child items (pads, fp text) are intentionally NOT visited individually — they move with their
// parent footprint, so the bridge syncs the footprint as a unit (its uuid in m_itemByIdCache).
template <typename Fn>
void forEachTopItem( BOARD& aBoard, Fn&& aFn )
{
    for( PCB_TRACK* t : aBoard.Tracks() )       aFn( static_cast<BOARD_ITEM*>( t ) );
    for( FOOTPRINT* f : aBoard.Footprints() )   aFn( static_cast<BOARD_ITEM*>( f ) );
    for( BOARD_ITEM* d : aBoard.Drawings() )    aFn( d );
    for( ZONE* z : aBoard.Zones() )             aFn( static_cast<BOARD_ITEM*>( z ) );
    for( PCB_GROUP* g : aBoard.Groups() )       aFn( static_cast<BOARD_ITEM*>( g ) );
}

// The diff/wire unit for one board item: the fields apply() can act on. Tracks carry their two
// endpoints + width (they reshape, like an eeschema SCH_LINE); everything else syncs position.
// Deliberately NO opaque s-expr blob here — keeping the diff unit to the applicable fields
// avoids broadcasting `changed` entries the peer can only partially apply (which would diverge
// then loop). Added-item reconstruction is handled type-by-type in makeItem instead.
json itemToJson( BOARD_ITEM* aItem )
{
    VECTOR2I p = aItem->GetPosition();
    json     j = {
        { "id", toUtf8( aItem->m_Uuid.AsString() ) },
        { "type", toUtf8( aItem->GetClass() ) },
        { "x", p.x },   // internal units (nm); integral, no quantization needed
        { "y", p.y },
        { "layer", (int) aItem->GetLayer() },
    };

    if( isTrackType( aItem->Type() ) )
    {
        auto* tr   = static_cast<PCB_TRACK*>( aItem );
        j["sx"]    = tr->GetStart().x;
        j["sy"]    = tr->GetStart().y;
        j["ex"]    = tr->GetEnd().x;
        j["ey"]    = tr->GetEnd().y;
        j["width"] = tr->GetWidth();
    }

    return j;
}

// Construct a new BOARD_ITEM from a delta item (for `added`), with the delta's uuid (m_Uuid is
// const → const_cast, exactly as the s-expr parser does). Returns nullptr for types without a
// converter yet (footprints/vias/zones — deferred, see header). PCB_TRACK segments reconstruct
// natively (no clipboard Parse), so the add path is trap-free for the common collab case.
BOARD_ITEM* makeItem( BOARD& aBoard, const json& j )
{
    std::string type = j.value( "type", "" );
    BOARD_ITEM* item = nullptr;

    if( type == "PCB_TRACK" )
    {
        auto* tr = new PCB_TRACK( &aBoard );
        tr->SetStart( VECTOR2I( j.value( "sx", 0 ), j.value( "sy", 0 ) ) );
        tr->SetEnd( VECTOR2I( j.value( "ex", 0 ), j.value( "ey", 0 ) ) );
        tr->SetWidth( j.value( "width", 0 ) );
        tr->SetLayer( (PCB_LAYER_ID) j.value( "layer", (int) F_Cu ) );
        item = tr;
    }
    // PCB_VIA / PCB_ARC / FOOTPRINT / ZONE `added` deferred (need layer-pair/drill, arc center,
    // or a library / s-expr clipboard blob — same deferred class as SCH_SYMBOL). Their move/
    // delete already sync via the generic changed/removed paths.

    if( item )
        const_cast<KIID&>( item->m_Uuid ) = KIID( wxString::FromUTF8( j.value( "id", "" ).c_str() ) );

    return item;
}

// Set an existing item's geometry from a `changed` delta. Tracks reshape via their endpoints
// (independent — like an eeschema wire); everything else moves to an absolute position.
// SetStart/SetEnd/SetPosition run inside the apply COROUTINE (see kicadCollabApply), the same
// fiber context native edits use, so the virtual dispatch resolves correctly.
void applyChanged( BOARD_ITEM* aItem, const json& j )
{
    if( isTrackType( aItem->Type() ) && j.contains( "sx" ) )
    {
        auto* tr = static_cast<PCB_TRACK*>( aItem );
        tr->SetStart( VECTOR2I( j["sx"].get<int>(), j["sy"].get<int>() ) );
        tr->SetEnd( VECTOR2I( j["ex"].get<int>(), j["ey"].get<int>() ) );

        if( j.contains( "width" ) )
            tr->SetWidth( j["width"].get<int>() );
    }
    else if( j.contains( "x" ) && j.contains( "y" ) )
    {
        aItem->SetPosition( VECTOR2I( j["x"].get<int>(), j["y"].get<int>() ) );
    }
}

void emit( const json& aDelta )
{
    std::string s = aDelta.dump();
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onDelta )
            window.kicadCollab.onDelta( UTF8ToString( $0 ) );
    }, s.c_str() );
}

// ── Emit via post-settle snapshot diff (mirrors eeschema 0007) ───────────────────────────────
//
// A local edit is one BOARD_COMMIT::Push that fires the listener callbacks synchronously and
// THEN recomputes connectivity/ratsnest. The native listener therefore only ever sees the
// pre-cleanup geometry. So treat the listener purely as a "something changed" trigger and
// broadcast a DIFF of the full model taken AFTER the edit settles (a CallAfter, which runs once
// Push has fully returned) — capturing this tab's FINAL geometry. The peer applies that and
// re-applying already-settled geometry is idempotent, so the two converge. g_baseline holds the
// last-broadcast state.

std::map<std::string, json> snapshotByUuid( BOARD& aBoard )
{
    std::map<std::string, json> m;

    forEachTopItem( aBoard, [&]( BOARD_ITEM* item )
                    {
                        std::string id = toUtf8( item->m_Uuid.AsString() );

                        if( !m.count( id ) )
                            m[id] = itemToJson( item );
                    } );

    return m;
}

std::map<std::string, json> g_baseline;
bool                        g_flushScheduled = false;

// Re-seed the diff baseline to the current model — after handing out a seed snapshot, or after
// applying a remote delta (so those items aren't re-broadcast as a spurious local diff/echo).
void rebaseline()
{
    if( PCB_EDIT_FRAME* fr = pcbFrame() )
        g_baseline = snapshotByUuid( *fr->GetBoard() );
}

// Diff the current (settled, post-cleanup) model against the baseline and broadcast the change.
void flushDiff()
{
    g_flushScheduled = false;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    std::map<std::string, json> cur = snapshotByUuid( *fr->GetBoard() );

    json added = json::array(), changed = json::array(), removed = json::array();

    for( const auto& [id, j] : cur )
    {
        auto it = g_baseline.find( id );

        if( it == g_baseline.end() )
            added.push_back( j );
        else if( it->second != j )
            changed.push_back( j );
    }

    for( const auto& [id, j] : g_baseline )
    {
        if( !cur.count( id ) )
            removed.push_back( id );
    }

    g_baseline = std::move( cur );

    if( !added.empty() || !changed.empty() || !removed.empty() )
        emit( json{ { "added", added }, { "changed", changed }, { "removed", removed } } );
}

// Coalesce all the listener callbacks of one commit (and any other edits in the same loop
// turn) into a single post-settle diff.
void scheduleFlush()
{
    if( g_flushScheduled )
        return;

    g_flushScheduled = true;

    if( PCB_EDIT_FRAME* fr = pcbFrame() )
        fr->CallAfter( []() { flushDiff(); } );
    else
        flushDiff();
}

// ChangeSource: the native BOARD_LISTENER is just a trigger — the actual change set comes from
// the post-settle snapshot diff above. Skipped while applying a remote delta (no echo); doApply
// rebaselines instead. OnBoardCompositeUpdate (the single combined add/remove/change event,
// 0004) plus the bulk + singular callbacks all funnel into one trigger.
class COLLAB_LISTENER : public BOARD_LISTENER
{
public:
    void OnBoardItemAdded( BOARD&, BOARD_ITEM* ) override                       { trigger(); }
    void OnBoardItemsAdded( BOARD&, std::vector<BOARD_ITEM*>& ) override        { trigger(); }
    void OnBoardItemRemoved( BOARD&, BOARD_ITEM* ) override                     { trigger(); }
    void OnBoardItemsRemoved( BOARD&, std::vector<BOARD_ITEM*>& ) override      { trigger(); }
    void OnBoardItemChanged( BOARD&, BOARD_ITEM* ) override                     { trigger(); }
    void OnBoardItemsChanged( BOARD&, std::vector<BOARD_ITEM*>& ) override      { trigger(); }
    void OnBoardCompositeUpdate( BOARD&, std::vector<BOARD_ITEM*>&,
                                 std::vector<BOARD_ITEM*>&,
                                 std::vector<BOARD_ITEM*>& ) override            { trigger(); }

private:
    void trigger()
    {
        if( !s_applyingRemote )
            scheduleFlush();
    }
};

COLLAB_LISTENER* g_listener = nullptr;

// Get the live BOARD and ensure our listener is registered on it (idempotent).
BOARD* ensureBridge()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return nullptr;

    BOARD* board = fr->GetBoard();

    if( !g_listener )
    {
        g_listener = new COLLAB_LISTENER();
        board->AddListener( g_listener );
    }

    return board;
}

// The actual model mutation, via BOARD_COMMIT so connectivity + ratsnest recompute exactly as
// for a UI edit (0004 §apply: never bypass the commit for remote ops). Runs inside the apply
// COROUTINE (see kicadCollabApply).
void doApply( PCB_EDIT_FRAME* aFrame, const json& aDelta )
{
    BOARD* board = aFrame->GetBoard();

    s_applyingRemote = true;

    BOARD_COMMIT commit( aFrame );
    bool         staged = false;

    for( const json& rid : aDelta.value( "removed", json::array() ) )
    {
        KIID id( wxString::FromUTF8( rid.get<std::string>().c_str() ) );

        if( BOARD_ITEM* item = board->ResolveItem( id, /*allowNullptr*/ true ) )
        {
            commit.Remove( item );
            staged = true;
        }
    }

    for( const json& j : aDelta.value( "changed", json::array() ) )
    {
        KIID id( wxString::FromUTF8( j.value( "id", "" ).c_str() ) );

        if( BOARD_ITEM* item = board->ResolveItem( id, /*allowNullptr*/ true ) )
        {
            commit.Modify( item );
            applyChanged( item, j );
            staged = true;
        }
    }

    for( const json& j : aDelta.value( "added", json::array() ) )
    {
        KIID id( wxString::FromUTF8( j.value( "id", "" ).c_str() ) );

        if( board->ResolveItem( id, /*allowNullptr*/ true ) )
            continue;                       // already present (our own echo)

        if( BOARD_ITEM* item = makeItem( *board, j ) )
        {
            commit.Add( item );
            staged = true;
        }
        else
        {
            EM_ASM( { console.log( "[collab] pcbnew apply: no converter for added type " + UTF8ToString( $0 ) ); },
                    j.value( "type", "?" ).c_str() );
        }
    }

    if( staged )
        commit.Push( wxT( "Collaborative edit" ) );

    // The applied remote changes (and any connectivity cleanup they triggered) are now the
    // shared state — fold them into the baseline so the post-apply listener flush doesn't
    // re-broadcast them as a local diff (echo).
    rebaseline();
    s_applyingRemote = false;
}

// Test/PoC move (the BOARD_COMMIT body for kicadCollabTestMoveFirst, deferred via CallAfter).
void collabTestMove( PCB_EDIT_FRAME* aFrame, BOARD_ITEM* aItem, int aDx, int aDy )
{
    BOARD_COMMIT commit( aFrame );
    commit.Modify( aItem );
    aItem->Move( VECTOR2I( aDx, aDy ) );
    commit.Push( wxT( "Collab test move" ) );
}

} // namespace


// JS → C++. Apply a remote per-item delta by uuid, through BOARD_COMMIT so connectivity/ratsnest
// recompute the same way a UI edit would (0004 §apply).
//
// BOARD_COMMIT must run in the editor's Asyncify-rooted main loop — invoking it from this embind
// ccall, or from a setTimeout callback, traps with an "indirect call signature mismatch" (those
// aren't the asyncify root). wxEvtHandler::CallAfter queues onto the app's pending-event list,
// drained every frame by the wasm main loop (src/wasm/evtloop.cpp) — the exact context real UI
// edits run in. Additionally run the mutation inside a COROUTINE so it executes on a libcontext
// fiber stack: BOARD_COMMIT::Push's CHT_ADD of a freshly-built item dispatches GAL virtuals
// (view->Add → ViewGetLayers) through asyncify-instrumented invoke_*; off the fiber stack those
// mis-dispatch and trap inside KiCad core, on it they dispatch correctly (eeschema 0007).
void kicadCollabApply( std::string aJson )
{
    json delta = json::parse( aJson, nullptr, /*allow_exceptions*/ false );

    if( delta.is_discarded() )
        return;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    fr->CallAfter( [fr, delta]() {
        COROUTINE<int, int> cor( [fr, delta]( int ) -> int
                                 {
                                     doApply( fr, delta );
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );
}


// JS pull of the full current model as an all-"added" delta (seed/baseline). Also registers the
// change listener on first call.
std::string kicadCollabSnapshot()
{
    BOARD* board = ensureBridge();

    json added = json::array();

    if( board )
    {
        forEachTopItem( *board, [&]( BOARD_ITEM* item ) { added.push_back( itemToJson( item ) ); } );
    }

    // Seed the diff baseline to exactly the model we're handing out, so the first local edit
    // diffs against this snapshot (and we don't re-broadcast the whole model).
    rebaseline();

    return json{ { "added", added }, { "changed", json::array() },
                 { "removed", json::array() } }.dump();
}


// Test/PoC helper: move the first top-level board item by (dx,dy) IU via a real BOARD_COMMIT,
// firing the listener — a deterministic local edit for the two-tab demo / e2e. Returns the
// moved item's uuid.
std::string kicadCollabTestMoveFirst( int aDx, int aDy )
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return "";

    std::string movedId;

    forEachTopItem( *fr->GetBoard(), [&]( BOARD_ITEM* item )
                    {
                        if( !movedId.empty() )
                            return;

                        movedId = toUtf8( item->m_Uuid.AsString() );
                        fr->CallAfter( [fr, item, aDx, aDy]() { collabTestMove( fr, item, aDx, aDy ); } );
                    } );

    return movedId;
}


// Test helper: read an item's position by uuid as "x,y" (internal units).
std::string kicadCollabGetPos( std::string aId )
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return "";

    KIID id( wxString::FromUTF8( aId.c_str() ) );

    if( BOARD_ITEM* item = fr->GetBoard()->ResolveItem( id, /*allowNullptr*/ true ) )
    {
        VECTOR2I p = item->GetPosition();
        return std::to_string( p.x ) + "," + std::to_string( p.y );
    }

    return "";
}

// Wrapper to return footprints as vector for JS iteration
std::vector<FOOTPRINT*> Board_GetFootprints(BOARD* board) {
    if (!board) return {};
    std::vector<FOOTPRINT*> result;
    for (FOOTPRINT* fp : board->Footprints()) {
        result.push_back(fp);
    }
    return result;
}

// Wrapper to return pads as vector
std::vector<PAD*> Footprint_GetPads(FOOTPRINT* fp) {
    if (!fp) return {};
    std::vector<PAD*> result;
    for (PAD* pad : fp->Pads()) {
        result.push_back(pad);
    }
    return result;
}

// Wrapper for GetFileName since it returns wxString
std::string Board_GetFileName(BOARD* board) {
    if (!board) return "";
    return board->GetFileName().ToStdString();
}

// Wrapper for footprint reference
std::string Footprint_GetReference(FOOTPRINT* fp) {
    if (!fp) return "";
    return fp->GetReference().ToStdString();
}

// Wrapper for footprint value
std::string Footprint_GetValue(FOOTPRINT* fp) {
    if (!fp) return "";
    return fp->GetValue().ToStdString();
}

// Wrapper for pad number
std::string Pad_GetNumber(PAD* pad) {
    if (!pad) return "";
    return pad->GetNumber().ToStdString();
}

// Wrapper for pad pin function
std::string Pad_GetPinFunction(PAD* pad) {
    if (!pad) return "";
    return pad->GetPinFunction().ToStdString();
}

EMSCRIPTEN_BINDINGS(pcbnew) {
    // Register vector types for iteration
    register_vector<FOOTPRINT*>("FootprintVector");
    register_vector<PAD*>("PadVector");

    // Helper functions that operate on pointers
    // Note: GetBoard() not available - will be added when Pyodide integration is done
    function("Board_GetFootprints", &Board_GetFootprints, allow_raw_pointers());
    function("Board_GetFileName", &Board_GetFileName, allow_raw_pointers());
    function("Footprint_GetPads", &Footprint_GetPads, allow_raw_pointers());
    function("Footprint_GetReference", &Footprint_GetReference, allow_raw_pointers());
    function("Footprint_GetValue", &Footprint_GetValue, allow_raw_pointers());
    function("Pad_GetNumber", &Pad_GetNumber, allow_raw_pointers());
    function("Pad_GetPinFunction", &Pad_GetPinFunction, allow_raw_pointers());

    // Programmatic file open (preferred over UI automation from the web app).
    function("kicadOpenFile", &kicadOpenFile);

    // Yjs collaborative bridge entry points (same contract as pl_editor / eeschema).
    function("kicadCollabApply", &kicadCollabApply);
    function("kicadCollabSnapshot", &kicadCollabSnapshot);
    function("kicadCollabTestMoveFirst", &kicadCollabTestMoveFirst);
    function("kicadCollabGetPos", &kicadCollabGetPos);
}
#endif
