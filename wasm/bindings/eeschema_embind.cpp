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
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>
#include <wx/app.h>
#include <wx/filename.h>
#include <wx/string.h>
#include <wx/window.h>
#include <nlohmann/json.hpp>
#include <kiid.h>
#include <layer_ids.h>
#include <schematic.h>
#include <sch_edit_frame.h>
#include <sch_io/kicad_sexpr/sch_io_kicad_sexpr.h>
#include <sch_sheet.h>
#include <richio.h>
#include <lib_symbol.h>
#include <tools/sch_selection.h>
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

// The screen of the sheet the editor is currently showing. Per-sheet collab keys a room
// to each .kicad_sch, so the snapshot/diff that feeds a room must cover ONLY this screen,
// never the whole Hierarchy(). GetCurrentSheet().LastScreen() is the active sheet's screen
// (GetScreen() tracks the same screen and is the fallback before a sheet path exists).
SCH_SCREEN* currentScreen( SCH_EDIT_FRAME* aFrame )
{
    if( !aFrame )
        return nullptr;

    if( SCH_SCREEN* screen = aFrame->GetCurrentSheet().LastScreen() )
        return screen;

    return aFrame->GetScreen();
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

// Current model of the ACTIVE screen as an array of item json. One collab room == one
// .kicad_sch screen, so we never fold in the rest of the hierarchy (uuids are unique
// within a screen, so no cross-sheet dedup is needed).
json snapshotItems( SCH_EDIT_FRAME* aFrame )
{
    json arr = json::array();

    if( SCH_SCREEN* screen = currentScreen( aFrame ) )
    {
        for( SCH_ITEM* item : screen->Items() )
            arr.push_back( itemToJson( item ) );
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

// v2 "items" wire emit (ysync 0008): per-item s-expr blobs instead of decomposed
// scalars. A JS runtime registers window.kicadCollab.onItems to opt in; both wires
// are emitted side by side until the scalar path is retired.
void emitItems( const json& aWire )
{
    std::string s = aWire.dump();
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onItems )
            window.kicadCollab.onItems( UTF8ToString( $0 ) );
    }, s.c_str() );
}

// Notify the standalone that the editor switched to a different sheet — a different
// .kicad_sch == a different collab room (ysync subschemas). The path is the active
// screen's load path: the same absolute MEMFS form kicadCollabOnSave emits, so the JS
// side strips the project prefix the same way (relativeProjectPath). No-op without a
// JS listener.
void emitSheetChanged()
{
    SCH_SCREEN* screen = currentScreen( schFrame() );

    if( !screen )
        return;

    std::string s = toUtf8( screen->GetFileName() );
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onSheetChanged )
            window.kicadCollab.onSheetChanged( UTF8ToString( $0 ) );
    }, s.c_str() );
}

// Serialize one live schematic item to its native s-expr via the clipboard
// formatter (the exact path Ctrl-C uses: a one-item SCH_SELECTION through
// SCH_IO_KICAD_SEXPR::Format). For a symbol the output also carries its
// (lib_symbols …) definition, just like a copy does.
std::string itemBlob( SCH_EDIT_FRAME* aFrame, SCH_ITEM* aItem )
{
    SCH_SELECTION sel;
    sel.SetScreen( aFrame->GetScreen() );
    sel.Add( aItem );

    STRING_FORMATTER   fmt;
    SCH_IO_KICAD_SEXPR plugin;
    plugin.Format( &sel, &aFrame->GetCurrentSheet(), aFrame->Schematic(), &fmt,
                   /*aForClipboard*/ true );
    return fmt.GetString();
}

// ── Emit via post-settle snapshot diff ───────────────────────────────────────────────────
//
// A local edit is a single SCH_COMMIT::Push that fires OnItemsAdded/Removed/Changed
// synchronously and THEN runs RecalculateConnections (sch_commit.cpp ~402-430). So the native
// listener only ever sees the *pre-cleanup* (raw) geometry, while the connectivity cleanup
// that follows — merging collinear wires, dropping redundant junctions, splitting at new
// crossings — is never reported. Broadcasting those raw per-category lists made the peer
// reconstruct the edit from the raw state and run ITS OWN cleanup, over a different "dirty"
// scope, so on a big connected drag the two peers cleaned up differently and the peer lost
// segments/junctions.
//
// Instead, treat the listener purely as a "something changed" trigger and broadcast a DIFF of
// the full model taken AFTER the edit settles — a CallAfter, which runs once Push (cleanup
// included) has fully returned. That captures tab A's FINAL, already-clean geometry; the peer
// applies it and re-cleaning already-clean geometry is idempotent, so the two converge. (This
// mirrors pl_editor's snapshot-differ.) g_baseline is the last-broadcast state.

// Diff baseline of the ACTIVE screen only (per-sheet collab room scope), keyed by uuid.
std::map<std::string, json> snapshotByUuid( SCH_EDIT_FRAME* aFrame )
{
    std::map<std::string, json> m;

    if( SCH_SCREEN* screen = currentScreen( aFrame ) )
    {
        for( SCH_ITEM* item : screen->Items() )
            m[toUtf8( item->m_Uuid.AsString() )] = itemToJson( item );
    }

    return m;
}

std::map<std::string, json> g_baseline;
bool                        g_flushScheduled = false;

// Re-seed the diff baseline to the current model — after handing out a seed snapshot, or after
// applying a remote delta (so those items aren't re-broadcast as a spurious local diff/echo).
void rebaseline()
{
    if( SCH_EDIT_FRAME* fr = schFrame() )
        g_baseline = snapshotByUuid( fr );
}

// Diff the current (settled, post-cleanup) model against the baseline and broadcast the change.
void flushDiff()
{
    g_flushScheduled = false;

    SCH_EDIT_FRAME* fr = schFrame();

    if( !fr )
        return;

    std::map<std::string, json> cur = snapshotByUuid( fr );

    json added = json::array(), changed = json::array(), removed = json::array();

    // v2 items wire (per-item s-expr blobs), built from the same diff. Screen items
    // are already root-level (fields live inside their symbols), so no lifting.
    json wAdded = json::array(), wChanged = json::array();

    auto blobFor = [&]( const std::string& id, json& aArr )
    {
        KIID kid( wxString::FromUTF8( id.c_str() ) );

        if( SCH_ITEM* item = fr->Schematic().ResolveItem( kid, nullptr, /*allowNull*/ true ) )
            aArr.push_back( json{ { "sexpr", itemBlob( fr, item ) }, { "parent", nullptr } } );
    };

    for( const auto& [id, j] : cur )
    {
        auto it = g_baseline.find( id );

        if( it == g_baseline.end() )
        {
            added.push_back( j );
            blobFor( id, wAdded );
        }
        else if( it->second != j )
        {
            changed.push_back( j );
            blobFor( id, wChanged );
        }
    }

    for( const auto& [id, j] : g_baseline )
    {
        if( !cur.count( id ) )
            removed.push_back( id );
    }

    g_baseline = std::move( cur );

    if( !added.empty() || !changed.empty() || !removed.empty() )
    {
        emit( json{ { "added", added }, { "changed", changed }, { "removed", removed } } );
        emitItems( json{ { "added", wAdded }, { "changed", wChanged }, { "removed", removed } } );
    }
}

// Coalesce all the listener callbacks of one commit (and any other edits in the same loop
// turn) into a single post-settle diff. flushDiff runs inside a COROUTINE: its v2 items
// emit serializes items via SCH_IO_KICAD_SEXPR::Format (itemBlob), whose virtual dispatch
// is only reliable on the libcontext fiber stack — on the bare CallAfter stack it traps
// and silently kills the whole flush, legacy emit included (same lesson as doApply, 0007).
void scheduleFlush()
{
    if( g_flushScheduled )
        return;

    g_flushScheduled = true;

    if( SCH_EDIT_FRAME* fr = schFrame() )
    {
        fr->CallAfter( []() {
            COROUTINE<int, int> cor( []( int ) -> int
                                     {
                                         flushDiff();
                                         return 0;
                                     } );
            cor.Call( 0 );
        } );
    }
    else
    {
        flushDiff();
    }
}

// A hierarchical sheet was just created locally ("Add Sheet"): write its new child screen
// to the child .kicad_sch file and tell the standalone (window.kicadCollab.onSheetCreated),
// so the child is persisted/registered the moment it's created — without waiting for the
// user to enter it or save the project. Otherwise the parent's `(sheet … child)` reference
// dangles for peers / on reload. Deferred onto the fiber stack (CallAfter + COROUTINE):
// SCH_IO_KICAD_SEXPR::Format's virtual dispatch traps on the bare listener/CallAfter stack,
// same as flushDiff/doApply. The sheet is re-resolved by uuid in the deferred body so a
// since-deleted sheet (e.g. an immediate undo) is a no-op rather than a dangling pointer.
void scheduleSheetSave( SCH_SHEET* aSheet )
{
    SCH_EDIT_FRAME* fr = schFrame();
    SCH_SCREEN*     parent = currentScreen( fr );

    if( !fr || !parent || !aSheet->GetScreen() )
        return;

    wxFileName childFn( aSheet->GetFileName() ); // relative "Sheetfile"
    childFn.MakeAbsolute( wxFileName( parent->GetFileName() ).GetPath() );

    std::string childAbs = toUtf8( childFn.GetFullPath() );
    std::string uuid = toUtf8( aSheet->m_Uuid.AsString() );

    fr->CallAfter( [fr, childAbs, uuid]() {
        COROUTINE<int, int> cor( [fr, childAbs, uuid]( int ) -> int
        {
            KIID      kid( wxString::FromUTF8( uuid.c_str() ) );
            SCH_ITEM* item = fr->Schematic().ResolveItem( kid, nullptr, /*allowNull*/ true );

            if( !item || item->Type() != SCH_SHEET_T )
                return 0;

            try
            {
                SCH_IO_KICAD_SEXPR io;
                io.SaveSchematicFile( wxString::FromUTF8( childAbs.c_str() ),
                                      static_cast<SCH_SHEET*>( item ), &fr->Schematic() );
            }
            catch( ... )
            {
                return 0; // a write failure must not abort the runtime
            }

            EM_ASM( {
                if( window.kicadCollab && window.kicadCollab.onSheetCreated )
                    window.kicadCollab.onSheetCreated( UTF8ToString( $0 ) );
            }, childAbs.c_str() );
            return 0;
        } );
        cor.Call( 0 );
    } );
}

// ChangeSource: the native SCHEMATIC_LISTENER is just a trigger — the actual change set comes
// from the post-settle snapshot diff above. Skipped while applying a remote delta (no echo);
// doApply rebaselines instead.
class COLLAB_LISTENER : public SCHEMATIC_LISTENER
{
public:
    void OnSchItemsAdded( SCHEMATIC&, std::vector<SCH_ITEM*>& aItems ) override
    {
        // A newly-added hierarchical sheet → persist + register its child file (above).
        if( !s_applyingRemote )
        {
            for( SCH_ITEM* item : aItems )
                if( item->Type() == SCH_SHEET_T )
                    scheduleSheetSave( static_cast<SCH_SHEET*>( item ) );
        }
        trigger();
    }
    void OnSchItemsChanged( SCHEMATIC&, std::vector<SCH_ITEM*>& ) override { trigger(); }
    void OnSchItemsRemoved( SCHEMATIC&, std::vector<SCH_ITEM*>& ) override { trigger(); }

    // The editor switched to a different sheet (a different .kicad_sch == a different
    // collab room). Re-baseline so the first edit on the new sheet diffs against ITS
    // screen, not the previous one, then tell the standalone to rebind its room to the
    // now-active sheet file. Fires from SCH_EDIT_FRAME::DisplayCurrentSheet, by which
    // point GetCurrentSheet()/GetScreen() already point at the new sheet.
    void OnSchSheetChanged( SCHEMATIC& ) override
    {
        rebaseline();
        emitSheetChanged();
    }

private:
    void trigger()
    {
        if( !s_applyingRemote )
            scheduleFlush();
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

    // The applied remote changes (and any connectivity cleanup they triggered) are now the
    // shared state — fold them into the baseline so the post-apply listener flush doesn't
    // re-broadcast them as a local diff (echo).
    rebaseline();
    s_applyingRemote = false;
}

// v2 items apply: removed by uuid; added/changed are an idempotent per-item upsert.
// Each blob is parsed through the clipboard-paste path — LoadContent into a throwaway
// sheet (sch_editor_control.cpp Paste pattern) — then the loaded items are detached,
// matched by uuid against the live model (replace), lib-relinked for symbols, and
// committed. Runs inside the apply COROUTINE (see kicadCollabApplyItems).
void doApplyItems( SCH_EDIT_FRAME* aFrame, const json& aWire )
{
    SCHEMATIC& sch = aFrame->Schematic();

    s_applyingRemote = true;

    SCH_COMMIT commit( aFrame );
    bool       staged = false;

    for( const json& rid : aWire.value( "removed", json::array() ) )
    {
        SCH_SHEET_PATH path;
        KIID           id( wxString::FromUTF8( rid.get<std::string>().c_str() ) );

        if( SCH_ITEM* item = sch.ResolveItem( id, &path, /*allowNull*/ true ) )
        {
            commit.Remove( item, path.LastScreen() );
            staged = true;
        }
    }

    auto upsert = [&]( const json& w )
    {
        std::string sexpr = w.value( "sexpr", "" );

        if( sexpr.find_first_not_of( " \t\r\n" ) == std::string::npos )
            return;

        // Parse into a throwaway sheet exactly like clipboard paste does. The screen
        // is heap-allocated and owned by the sheet (freed with it).
        SCH_SHEET   tempSheet;
        SCH_SCREEN* tempScreen = new SCH_SCREEN( &sch );
        tempSheet.SetScreen( tempScreen );

        STRING_LINE_READER reader( sexpr, wxT( "collab-items" ) );
        SCH_IO_KICAD_SEXPR plugin;

        try
        {
            plugin.LoadContent( reader, &tempSheet );
        }
        catch( ... )
        {
            EM_ASM( { console.log( "[collab] eeschema applyItems: blob parse failed" ); } );
            return;
        }

        // Resolve a symbol's LIB_SYMBOL: prefer the blob's own (lib_symbols …) cache
        // (a clipboard-style blob carries it), else the live screen's — peers share
        // the same document so the definition is normally already present.
        auto findLib = [&]( SCH_SYMBOL* aSym ) -> LIB_SYMBOL*
        {
            wxString lookup = aSym->GetLibId().Format().wx_str();

            if( !aSym->UseLibIdLookup() )
                lookup = aSym->GetSchSymbolLibraryName();

            auto& tlibs = tempScreen->GetLibSymbols();
            auto  ti    = tlibs.find( lookup );

            if( ti != tlibs.end() )
                return new LIB_SYMBOL( *ti->second );

            auto& libs = aFrame->GetScreen()->GetLibSymbols();
            auto  li   = libs.find( lookup );

            if( li != libs.end() )
                return new LIB_SYMBOL( *li->second );

            return nullptr;
        };

        std::vector<SCH_ITEM*> loaded;

        for( SCH_ITEM* item : tempScreen->Items() )
            loaded.push_back( item );

        for( SCH_ITEM* item : loaded )
        {
            tempScreen->Remove( item );     // detach: tempSheet's dtor must not free it

            SCH_SHEET_PATH path;

            if( SCH_ITEM* existing = sch.ResolveItem( item->m_Uuid, &path, /*allowNull*/ true ) )
                commit.Remove( existing, path.LastScreen() );

            if( item->Type() == SCH_SYMBOL_T )
            {
                auto* sym = static_cast<SCH_SYMBOL*>( item );

                if( LIB_SYMBOL* lib = findLib( sym ) )
                    sym->SetLibSymbol( lib );
            }

            item->SetParent( &sch );
            commit.Add( item, aFrame->GetScreen() );
            staged = true;
        }
    };

    for( const json& w : aWire.value( "added", json::array() ) )
        upsert( w );
    for( const json& w : aWire.value( "changed", json::array() ) )
        upsert( w );

    if( staged )
        commit.Push( wxT( "Collaborative edit (items)" ) );

    // Fold the applied state into the baseline so the post-apply listener flush
    // doesn't re-broadcast it as a local diff (echo).
    rebaseline();
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
    ensureBridge();
    json added = snapshotItems( schFrame() );

    // Seed the diff baseline to exactly the model we're handing out, so the first local edit
    // diffs against this snapshot (and we don't re-broadcast the whole model).
    rebaseline();

    return json{ { "added", added }, { "changed", json::array() },
                 { "removed", json::array() } }.dump();
}


// JS → C++, v2 items wire. Same CallAfter + COROUTINE context as kicadCollabApply
// (LoadContent + SCH_COMMIT must run where native edits run).
void kicadCollabApplyItems( std::string aJson )
{
    json wire = json::parse( aJson, nullptr, /*allow_exceptions*/ false );

    if( wire.is_discarded() )
        return;

    SCH_EDIT_FRAME* fr = schFrame();

    if( !fr )
        return;

    fr->CallAfter( [fr, wire]() {
        COROUTINE<int, int> cor( [fr, wire]( int ) -> int
                                 {
                                     doApplyItems( fr, wire );
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );
}


// JS pull of the ACTIVE screen's model as an all-"added" v2 items wire: one clipboard-
// style blob per item on the current sheet (one collab room == one .kicad_sch screen).
// Registers the listener + rebaselines exactly like kicadCollabSnapshot.
std::string kicadCollabSnapshotItems()
{
    SCH_EDIT_FRAME* fr = schFrame();

    json added = json::array();

    if( fr )
    {
        ensureBridge();

        if( SCH_SCREEN* screen = currentScreen( fr ) )
        {
            for( SCH_ITEM* item : screen->Items() )
                added.push_back( json{ { "sexpr", itemBlob( fr, item ) }, { "parent", nullptr } } );
        }

        rebaseline();
    }

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


// Programmatically save the in-memory schematic to a .kicad_sch file, without
// driving the Save As dialog — eeschema's analogue of pl_editor's
// kicadSaveDrawingSheet. Serializes the root sheet via the same SCH_IO_KICAD_SEXPR
// writer eeschema uses, so a test can read the file back from MEMFS and assert the
// file ⇄ Y.Doc round trip (README §A; feature 0004). Single-sheet scope: the round-
// trip fixtures are flat schematics; saving the root sheet writes the whole model.
// C++ → JS save notification (standalone-hardening save routing). Called from the
// kicad fork's save chokepoint (SCH_EDIT_FRAME::saveSchematicFile) after a
// successful write to MEMFS, so the web app can route the saved bytes onward
// (API upload, local-disk write-back, download). No-op without a JS listener.
extern "C" void kicadCollabOnSave( const char* aPath )
{
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onSave )
            window.kicadCollab.onSave( UTF8ToString( $0 ) );
    }, aPath );
}


void kicadSaveSchematic( std::string path )
{
    SCH_EDIT_FRAME* fr = schFrame();

    if( !fr )
        return;

    SCHEMATIC& sch = fr->Schematic();

    // Save the CURRENT sheet, not Schematic().Root(): in the wasm open flow the
    // opened document is displayed as the current sheet but can sit under an
    // auto-created project root, so Root()'s own screen holds only a child-sheet
    // symbol (not the loaded items). GetCurrentSheet() is the screen the editor is
    // actually showing — the one whose items the snapshot/round-trip care about.
    SCH_SHEET* sheet = fr->GetCurrentSheet().Last();

    if( !sheet )
        sheet = &sch.Root();

    try
    {
        SCH_IO_KICAD_SEXPR io;
        io.SaveSchematicFile( wxString::FromUTF8( path.c_str() ), sheet, &sch );
    }
    catch( ... )
    {
        // Don't abort the wasm runtime on a save failure; the JS caller detects it
        // by the file being absent / empty.
    }
}


EMSCRIPTEN_BINDINGS(eeschema) {
    // Programmatic file open (preferred over UI automation from the web app).
    function("kicadOpenFile", &kicadOpenFile);
    // Programmatic save of the in-memory schematic (round-trip tests, README §A).
    function("kicadSaveSchematic", &kicadSaveSchematic);
    // Yjs collaborative bridge entry points (same contract as pl_editor).
    function("kicadCollabApply", &kicadCollabApply);
    function("kicadCollabSnapshot", &kicadCollabSnapshot);
    // v2 items bridge: per-item s-expr payloads (ysync 0008).
    function("kicadCollabApplyItems", &kicadCollabApplyItems);
    function("kicadCollabSnapshotItems", &kicadCollabSnapshotItems);
    function("kicadCollabTestMoveFirst", &kicadCollabTestMoveFirst);
    function("kicadCollabGetPos", &kicadCollabGetPos);
}
#endif
