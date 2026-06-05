/*
 * Embind bindings for KiCad eeschema WASM.
 *
 * Picked up automatically by scripts/kicad/build-kicad-target.sh when building
 * the eeschema app (it compiles wasm/bindings/<app>_embind.cpp if present).
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/bind.h>
#include <kiway_player.h>
#include <kiway.h>
#include <memory>
#include <set>
#include <string>
#include <vector>
#include <wx/app.h>
#include <wx/string.h>
#include <wx/window.h>
#include <nlohmann/json.hpp>
#include <kiid.h>
#include <layer_ids.h>
#include <schematic.h>
#include <sch_edit_frame.h>
#include <sch_commit.h>
#include <sch_item.h>
#include <sch_line.h>
#include <sch_junction.h>
#include <sch_no_connect.h>
#include <sch_text.h>
#include <sch_label.h>
#include <sch_symbol.h>
#include <sch_field.h>
#include <sch_shape.h>
#include <eda_shape.h>
#include <stroke_params.h>
#include <sch_screen.h>
#include <sch_sheet_path.h>
#include <schematic_settings.h>
#include <tool/coroutine.h>

using namespace emscripten;
using json = nlohmann::json;

// Programmatically open a project file (schematic) in the running editor frame,
// without UI automation. Mirrors single_top.cpp's MacOpenFile path: the editor
// frame is the app's top window and is a KIWAY_PLAYER. Returns the result of
// OpenProjectFiles, or false if no frame is available — letting the JS caller
// fall back to driving File→Open.
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
// eeschema's half of the unified bridge contract (features/yjs-bridge/0001, 0003).
// Unlike pl_editor it needs NO kicad-fork change: SCH_ITEM already carries a stable
// KIID, and eeschema has native change machinery, so the adapter is a thin re-use:
//   ChangeSource (emit) = a SCHEMATIC_LISTENER subclass (SCH_COMMIT::Push fires it)
//   apply              = SCH_COMMIT Modify/Remove + Push (drives connectivity recompute)
// The generic JS reconciler / transport / WasmTool wiring are reused unchanged.
//
// Scope of this first commit (0003 §"first PoC"): position-level sync of existing
// items — changed (move/edit) and removed. Decomposed field coverage via reflection,
// constructing arbitrary new item types on `added`, and symbol-instance / multi-sheet
// scoping are deferred (see TODOs). Items are resolved by globally-unique uuid, so
// changed/removed already work across the whole hierarchy without sheet scoping.
namespace {

// Guard so SCH_COMMIT::Push's listener callbacks during apply() aren't re-emitted.
bool s_applyingRemote = false;

std::string toUtf8( const wxString& s ) { return std::string( s.utf8_str() ); }

SCH_EDIT_FRAME* schFrame()
{
    return wxTheApp ? dynamic_cast<SCH_EDIT_FRAME*>( wxTheApp->GetTopWindow() ) : nullptr;
}

json itemToJson( SCH_ITEM* aItem )
{
    VECTOR2I p = aItem->GetPosition();
    json     j = {
        { "id", toUtf8( aItem->m_Uuid.AsString() ) },
        { "type", toUtf8( aItem->GetClass() ) },
        { "x", p.x },   // internal units; integral, so no quantization needed
        { "y", p.y },
    };

    // Per-type fields needed to reconstruct the item on `added` (0003 converters).
    // Hand-mapped for the wire-editing types; other types sync position-only (move) and
    // are skipped on `added` (logged) until their converters are added.
    if( aItem->Type() == SCH_LINE_T )
    {
        auto* line = static_cast<SCH_LINE*>( aItem );
        j["sx"]    = line->GetStartPoint().x;
        j["sy"]    = line->GetStartPoint().y;
        j["ex"]    = line->GetEndPoint().x;
        j["ey"]    = line->GetEndPoint().y;
        j["layer"] = (int) line->GetLayer();
    }

    if( EDA_TEXT* txt = dynamic_cast<EDA_TEXT*>( aItem ) )
        j["text"] = toUtf8( txt->GetText() );

    if( SCH_LABEL_BASE* lbl = dynamic_cast<SCH_LABEL_BASE*>( aItem ) )
        j["shape"] = (int) lbl->GetShape();

    // Graphic shapes (circle / rectangle / arc / line / bezier): geometry is start/end plus,
    // for an arc, the center, and for a bezier the two control points. Stroke + fill complete it.
    if( aItem->Type() == SCH_SHAPE_T )
    {
        auto* shp   = static_cast<SCH_SHAPE*>( aItem );
        j["stype"]  = (int) shp->GetShape();          // SHAPE_T
        j["sx"]     = shp->GetStart().x;
        j["sy"]     = shp->GetStart().y;
        j["ex"]     = shp->GetEnd().x;
        j["ey"]     = shp->GetEnd().y;
        j["layer"]  = (int) shp->GetLayer();
        j["width"]  = shp->GetStroke().GetWidth();
        j["fill"]   = (int) shp->GetFillMode();

        if( shp->GetShape() == SHAPE_T::ARC )
        {
            VECTOR2I c = shp->GetCenter();
            j["cx"]    = c.x;
            j["cy"]    = c.y;
        }
        else if( shp->GetShape() == SHAPE_T::BEZIER )
        {
            j["c1x"] = shp->GetBezierC1().x;
            j["c1y"] = shp->GetBezierC1().y;
            j["c2x"] = shp->GetBezierC2().x;
            j["c2y"] = shp->GetBezierC2().y;
        }
    }

    return j;
}

// Construct a new SCH_ITEM from a delta item (for `added`), with the delta's uuid
// (m_Uuid is const → const_cast, exactly as the s-expr parser does). Returns nullptr for
// types without a converter yet.
SCH_ITEM* makeItem( const json& j )
{
    std::string type = j.value( "type", "" );
    SCH_ITEM*   item = nullptr;

    if( type == "SCH_LINE" )
    {
        int   layer = j.value( "layer", (int) LAYER_NOTES );
        auto* line  = new SCH_LINE( VECTOR2I( j.value( "sx", 0 ), j.value( "sy", 0 ) ), layer );
        line->SetEndPoint( VECTOR2I( j.value( "ex", 0 ), j.value( "ey", 0 ) ) );
        item = line;
    }
    else if( type == "SCH_JUNCTION" )
    {
        item = new SCH_JUNCTION( VECTOR2I( j.value( "x", 0 ), j.value( "y", 0 ) ) );
    }
    else if( type == "SCH_NO_CONNECT" )
    {
        item = new SCH_NO_CONNECT( VECTOR2I( j.value( "x", 0 ), j.value( "y", 0 ) ) );
    }
    else if( type == "SCH_TEXT" )
    {
        auto* txt = new SCH_TEXT( VECTOR2I( j.value( "x", 0 ), j.value( "y", 0 ) ),
                                  wxString::FromUTF8( j.value( "text", "" ).c_str() ) );

        // Mirror the interactive text tool (sch_drawing_tools.cpp createNewText): parent the
        // item to the schematic and apply the project's default text size, so a remotely-added
        // text resolves variables / renders identically to a locally-placed one.
        if( SCH_EDIT_FRAME* fr = schFrame() )
        {
            txt->SetParent( &fr->Schematic() );
            int sz = fr->Schematic().Settings().m_DefaultTextSize;
            txt->SetTextSize( VECTOR2I( sz, sz ) );
        }

        item = txt;
    }
    else if( type == "SCH_LABEL" || type == "SCH_GLOBALLABEL" || type == "SCH_HIERLABEL" )
    {
        VECTOR2I pos( j.value( "x", 0 ), j.value( "y", 0 ) );
        wxString text = wxString::FromUTF8( j.value( "text", "" ).c_str() );

        SCH_LABEL_BASE* lbl = ( type == "SCH_LABEL" )         ? (SCH_LABEL_BASE*) new SCH_LABEL( pos, text )
                              : ( type == "SCH_GLOBALLABEL" ) ? (SCH_LABEL_BASE*) new SCH_GLOBALLABEL( pos, text )
                                                             : (SCH_LABEL_BASE*) new SCH_HIERLABEL( pos, text );

        if( j.contains( "shape" ) )
            lbl->SetShape( (LABEL_FLAG_SHAPE) j["shape"].get<int>() );

        item = lbl;
    }
    else if( type == "SCH_SHAPE" )
    {
        // Reconstruct from the geometry itemToJson emits. Committing a *new* SCH_SHAPE used to
        // trap in SCH_COMMIT::Push's CHT_ADD path (GAL view->Add → an asyncify invoke_viii
        // mis-dispatch, "memory access out of bounds") because doApply ran off a fiber stack;
        // doApply now runs inside a COROUTINE (kicadCollabApply) so the add dispatches correctly,
        // exactly as a native draw does. (0006/0007.)  NB FILL_T::NO_FILL == 1, not 0.
        SHAPE_T st    = (SHAPE_T) j.value( "stype", (int) SHAPE_T::RECTANGLE );
        int     layer = j.value( "layer", (int) LAYER_NOTES );
        int     width = j.value( "width", 0 );
        FILL_T  fill  = (FILL_T) j.value( "fill", (int) FILL_T::NO_FILL );

        auto* shp = new SCH_SHAPE( st, (SCH_LAYER_ID) layer, width, fill );

        // Rectangle: two corners. Circle: start = center, end = a point on the radius. Both are
        // fully defined by start+end (what itemToJson emits via GetStart()/GetEnd()).
        shp->SetStart( VECTOR2I( j.value( "sx", 0 ), j.value( "sy", 0 ) ) );
        shp->SetEnd( VECTOR2I( j.value( "ex", 0 ), j.value( "ey", 0 ) ) );

        if( st == SHAPE_T::ARC && j.contains( "cx" ) )
        {
            shp->SetCenterX( j["cx"].get<int>() );
            shp->SetCenterY( j["cy"].get<int>() );
        }
        else if( st == SHAPE_T::BEZIER )
        {
            if( j.contains( "c1x" ) )
                shp->SetBezierC1( VECTOR2I( j["c1x"].get<int>(), j["c1y"].get<int>() ) );
            if( j.contains( "c2x" ) )
                shp->SetBezierC2( VECTOR2I( j["c2x"].get<int>(), j["c2y"].get<int>() ) );
        }

        if( SCH_EDIT_FRAME* fr = schFrame() )
            shp->SetParent( &fr->Schematic() );

        item = shp;
    }
    // SCH_SYMBOL `added` is still deferred (needs the s-expr clipboard-blob emit + LoadContent
    // reconstruction; symbol PLACEMENT is also natively blocked until symbol libraries are
    // bundled — see features/yjs-bridge tasks). Symbol move/position already syncs via `changed`.

    if( item )
        const_cast<KIID&>( item->m_Uuid ) = KIID( wxString::FromUTF8( j.value( "id", "" ).c_str() ) );

    return item;
}

// Full current model as an array of item json, deduped by uuid across the hierarchy.
json snapshotItems( SCHEMATIC& aSch )
{
    json               arr = json::array();
    std::set<std::string> seen;

    for( const SCH_SHEET_PATH& path : aSch.Hierarchy() )
    {
        SCH_SCREEN* screen = const_cast<SCH_SHEET_PATH&>( path ).LastScreen();

        if( !screen )
            continue;

        for( SCH_ITEM* item : screen->Items() )
        {
            std::string id = toUtf8( item->m_Uuid.AsString() );

            if( seen.insert( id ).second )
                arr.push_back( itemToJson( item ) );
        }
    }

    return arr;
}

void emit( const json& aDelta )
{
    std::string s = aDelta.dump();
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onDelta )
            window.kicadCollab.onDelta( UTF8ToString( $0 ) );
    }, s.c_str() );
}

// ChangeSource: native SCHEMATIC_LISTENER. SCH_COMMIT::Push fires these in bulk for
// every local edit (move, add, remove, …) — that's our emit trigger.
class COLLAB_LISTENER : public SCHEMATIC_LISTENER
{
public:
    void OnSchItemsAdded( SCHEMATIC&, std::vector<SCH_ITEM*>& aItems ) override
    {
        emitItems( "added", aItems );
    }

    void OnSchItemsChanged( SCHEMATIC&, std::vector<SCH_ITEM*>& aItems ) override
    {
        emitItems( "changed", aItems );
    }

    void OnSchItemsRemoved( SCHEMATIC&, std::vector<SCH_ITEM*>& aItems ) override
    {
        if( s_applyingRemote )
            return;

        json removed = json::array();

        for( SCH_ITEM* item : aItems )
            removed.push_back( toUtf8( item->m_Uuid.AsString() ) );

        if( !removed.empty() )
            emit( json{ { "added", json::array() }, { "changed", json::array() },
                        { "removed", removed } } );
    }

private:
    void emitItems( const char* aKey, std::vector<SCH_ITEM*>& aItems )
    {
        if( s_applyingRemote )
            return;

        json arr = json::array();

        for( SCH_ITEM* item : aItems )
            arr.push_back( itemToJson( item ) );

        if( arr.empty() )
            return;

        json d = { { "added", json::array() }, { "changed", json::array() },
                   { "removed", json::array() } };
        d[aKey] = arr;
        emit( d );
    }
};

COLLAB_LISTENER* g_listener = nullptr;

// Get the live SCHEMATIC and ensure our listener is registered on it (idempotent).
SCHEMATIC* ensureBridge()
{
    SCH_EDIT_FRAME* fr = schFrame();

    if( !fr )
        return nullptr;

    SCHEMATIC& sch = fr->Schematic();

    if( !g_listener )
    {
        g_listener = new COLLAB_LISTENER();
        sch.AddListener( g_listener );
    }

    return &sch;
}

} // namespace


namespace {

// SCH_SYMBOL::Move() / SCH_LABEL_BASE::Move() move their child fields (reference, value, …) via
// an inner `field.Move()` — itself a virtual call that mis-dispatches in the apply context, so
// the field text is left behind at its old position while the body moves. Re-move the fields
// with a devirtualized call so the labels follow the symbol on the peer. (The inner call is a
// harmless no-op when it mis-dispatches — the fields stay put — so this doesn't double-move.)
void moveFields( std::vector<SCH_FIELD>& aFields, const VECTOR2I& aDelta )
{
    for( SCH_FIELD& field : aFields )
        field.SCH_FIELD::Move( aDelta );
}

// Move an item to an absolute position for the `changed` path. SCH_ITEM::Move() is virtual;
// dispatching it through the vtable from the apply/CallAfter context hits the asyncify
// call_indirect mis-dispatch and silently NO-OPS (so symbols/junctions/labels never moved on
// the peer — only SCH_LINE worked, via its direct SetStart/EndPoint path). GetPosition() reads
// fine (it's a plain virtual read; see 0003 / eeschema_collab_asyncify_apply). The fix:
// devirtualize Move() with an explicit class-qualified call, which is statically bound — a
// plain wasm `call`, not an instrumented call_indirect — so it actually executes. Composite
// items additionally need their child fields moved (see moveFields).
void moveItemTo( SCH_ITEM* aItem, const VECTOR2I& aNewPos )
{
    VECTOR2I delta = aNewPos - aItem->GetPosition();

    if( delta == VECTOR2I( 0, 0 ) )
        return;

    switch( aItem->Type() )
    {
    case SCH_SYMBOL_T:
    {
        auto* sym = static_cast<SCH_SYMBOL*>( aItem );
        sym->SCH_SYMBOL::Move( delta );
        moveFields( sym->GetFields(), delta );
        break;
    }
    case SCH_JUNCTION_T:   static_cast<SCH_JUNCTION*>( aItem )->SCH_JUNCTION::Move( delta ); break;
    case SCH_NO_CONNECT_T: static_cast<SCH_NO_CONNECT*>( aItem )->SCH_NO_CONNECT::Move( delta ); break;
    case SCH_TEXT_T:       static_cast<SCH_TEXT*>( aItem )->SCH_TEXT::Move( delta ); break;
    case SCH_LABEL_T:
    case SCH_GLOBAL_LABEL_T:
    case SCH_HIER_LABEL_T:
    {
        auto* lbl = static_cast<SCH_LABEL_BASE*>( aItem );
        lbl->SCH_LABEL_BASE::Move( delta );
        moveFields( lbl->GetFields(), delta );
        break;
    }
    default:
        aItem->Move( delta );   // virtual fallback (may no-op in the apply context)
        break;
    }
}

// The actual model mutation, via SCH_COMMIT so connectivity/ERC recompute as for a UI
// edit. (Editor write ops like SCH_ITEM::Move are called through invoke_vii, whose
// asyncify-instrumented dynCall trampoline traps on a stale type — fixed at the JS shim
// layer in scripts/common/shims/dyncall-binding.js.tmpl; see 0003.)
void doApply( SCH_EDIT_FRAME* aFrame, const json& aDelta )
{
    SCHEMATIC& sch = aFrame->Schematic();

    s_applyingRemote = true;

    SCH_COMMIT commit( aFrame );
    bool       staged = false;

    for( const json& rid : aDelta.value( "removed", json::array() ) )
    {
        SCH_SHEET_PATH path;
        KIID          id( wxString::FromUTF8( rid.get<std::string>().c_str() ) );

        if( SCH_ITEM* item = sch.ResolveItem( id, &path, /*allowNull*/ true ) )
        {
            commit.Remove( item, path.LastScreen() );
            staged = true;
        }
    }

    for( const json& j : aDelta.value( "changed", json::array() ) )
    {
        SCH_SHEET_PATH path;
        KIID          id( wxString::FromUTF8( j.value( "id", "" ).c_str() ) );

        if( SCH_ITEM* item = sch.ResolveItem( id, &path, /*allowNull*/ true ) )
        {
            commit.Modify( item, path.LastScreen() );

            if( item->Type() == SCH_LINE_T && j.contains( "sx" ) )
            {
                // Wires reshape (endpoints move independently), so set both points.
                auto* line = static_cast<SCH_LINE*>( item );
                line->SetStartPoint( VECTOR2I( j["sx"].get<int>(), j["sy"].get<int>() ) );
                line->SetEndPoint( VECTOR2I( j["ex"].get<int>(), j["ey"].get<int>() ) );
            }
            else if( j.contains( "x" ) && j.contains( "y" ) )
            {
                moveItemTo( item, VECTOR2I( j["x"].get<int>(), j["y"].get<int>() ) );
            }

            staged = true;
        }
    }

    for( const json& j : aDelta.value( "added", json::array() ) )
    {
        KIID id( wxString::FromUTF8( j.value( "id", "" ).c_str() ) );

        if( sch.ResolveItem( id, nullptr, /*allowNull*/ true ) )
            continue;                       // already present (our own echo)

        if( SCH_ITEM* item = makeItem( j ) )
        {
            commit.Add( item, aFrame->GetScreen() );
            staged = true;
        }
        else
        {
            EM_ASM( { console.log( "[collab] eeschema apply: no converter for added type " + UTF8ToString( $0 ) ); },
                    j.value( "type", "?" ).c_str() );
        }
    }

    if( staged )
        commit.Push( wxT( "Collaborative edit" ) );

    s_applyingRemote = false;
}

// Test/PoC move (the SCH_COMMIT body for kicadCollabTestMoveFirst, deferred via CallAfter).
void collabTestMove( SCH_EDIT_FRAME* aFrame, SCH_ITEM* aItem, SCH_SCREEN* aScreen, int aDx,
                     int aDy )
{
    SCH_COMMIT commit( aFrame );
    commit.Modify( aItem, aScreen );
    aItem->Move( VECTOR2I( aDx, aDy ) );
    commit.Push( wxT( "Collab test move" ) );
}

} // namespace


// JS → C++. Apply a remote per-item delta by uuid, through SCH_COMMIT so connectivity/
// ERC/hierarchy recompute the same way a UI edit would (0003 §apply).
//
// SCH_COMMIT must run in the editor's Asyncify-rooted main loop — invoking it from this
// embind ccall, or from an emscripten_async_call/setTimeout callback, traps with an
// "indirect call signature mismatch" because those are not the asyncify root (0001 §5).
// wxEvtHandler::CallAfter queues onto the app's pending-event list, which the wasm main
// loop drains every frame via ProcessPendingEvents() (src/wasm/evtloop.cpp) — i.e. the
// exact context real UI edits run in. So defer the whole mutation there.
void kicadCollabApply( std::string aJson )
{
    json delta = json::parse( aJson, nullptr, /*allow_exceptions*/ false );

    if( delta.is_discarded() )
        return;

    SCH_EDIT_FRAME* fr = schFrame();

    if( !fr )
        return;

    // Defer to the editor's main-loop context so SCH_COMMIT runs like a normal edit, AND run the
    // mutation inside a COROUTINE so it executes on a libcontext fiber stack — the exact context
    // KiCad tool actions (native draws/edits) run in. SCH_COMMIT::Push's CHT_ADD of a *new*
    // SCH_SHAPE/SCH_SYMBOL dispatches GAL virtuals (view->Add → ViewGetLayers) through asyncify-
    // instrumented invoke_*; off the fiber stack those mis-dispatch and trap inside KiCad core
    // ("memory access out of bounds" / "table index out of bounds"), which the bridge can't
    // devirtualize. On the fiber stack they dispatch correctly. CallAfter runs on the app main
    // stack (ProcessPendingEvents), which is where COROUTINE::Call must be invoked from. (0007.)
    fr->CallAfter( [fr, delta]() {
        COROUTINE<int, int> cor( [fr, delta]( int ) -> int
                                 {
                                     doApply( fr, delta );
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );
}


// JS pull of the full current model as an all-"added" delta (seed/baseline). Also
// registers the change listener on first call.
std::string kicadCollabSnapshot()
{
    SCHEMATIC* sch = ensureBridge();
    json       added = sch ? snapshotItems( *sch ) : json::array();

    return json{ { "added", added }, { "changed", json::array() },
                 { "removed", json::array() } }.dump();
}


// Test/PoC helper: move the first schematic item by (dx,dy) IU via a real SCH_COMMIT,
// firing the listener — a deterministic local edit for the two-tab demo / e2e.
// Returns the moved item's uuid.
std::string kicadCollabTestMoveFirst( int aDx, int aDy )
{
    SCH_EDIT_FRAME* fr = schFrame();

    if( !fr )
        return "";

    SCHEMATIC& sch = fr->Schematic();

    for( const SCH_SHEET_PATH& path : sch.Hierarchy() )
    {
        SCH_SCREEN* screen = const_cast<SCH_SHEET_PATH&>( path ).LastScreen();

        if( !screen )
            continue;

        for( SCH_ITEM* item : screen->Items() )
        {
            fr->CallAfter( [fr, item, screen, aDx, aDy]() { collabTestMove( fr, item, screen, aDx, aDy ); } );
            return toUtf8( item->m_Uuid.AsString() );
        }
    }

    return "";
}


// Test helper: read an item's position by uuid as "x,y" (internal units).
std::string kicadCollabGetPos( std::string aId )
{
    SCH_EDIT_FRAME* fr = schFrame();

    if( !fr )
        return "";

    KIID id( wxString::FromUTF8( aId.c_str() ) );

    if( SCH_ITEM* item = fr->Schematic().ResolveItem( id, nullptr, /*allowNull*/ true ) )
    {
        VECTOR2I p = item->GetPosition();
        return std::to_string( p.x ) + "," + std::to_string( p.y );
    }

    return "";
}


EMSCRIPTEN_BINDINGS(eeschema) {
    // Programmatic file open (preferred over UI automation from the web app).
    function("kicadOpenFile", &kicadOpenFile);
    // Yjs collaborative bridge entry points (same contract as pl_editor).
    function("kicadCollabApply", &kicadCollabApply);
    function("kicadCollabSnapshot", &kicadCollabSnapshot);
    function("kicadCollabTestMoveFirst", &kicadCollabTestMoveFirst);
    function("kicadCollabGetPos", &kicadCollabGetPos);
}
#endif
