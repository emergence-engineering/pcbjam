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
#include <pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.h>
#include <board_item.h>
#include <footprint.h>
#include <pad.h>
#include <pcb_track.h>
#include <pcb_field.h>
#include <pcb_shape.h>
#include <pcb_text.h>
#include <pcb_group.h>
#include <zone.h>
#include <eda_text.h>
#include <pcb_edit_frame.h>
#include <kicad_clipboard.h>
#include <io/kicad/kicad_io_utils.h>
#include <richio.h>
#include <tools/pcb_selection.h>
#include <tools/pcb_selection_tool.h>
#include <geometry/shape_poly_set.h>
#include <geometry/shape_line_chain.h>
#include <geometry/eda_angle.h>
#include <kiway_player.h>
#include <kiway.h>
#include <kiid.h>
#include <layer_ids.h>
#include <lset.h>
#include <math/util.h>
#include <tool/coroutine.h>
#include <tool/tool_manager.h>
#include <view/view.h>
#include <view/view_overlay.h>
#include <pcb_draw_panel_gal.h>
#include <nlohmann/json.hpp>
#include "collab_presence_style.h"
#include <algorithm>
#include <chrono>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>
#include <wx/app.h>
#include <wx/event.h>
#include <wx/string.h>
#include <wx/window.h>

using namespace emscripten;
using json = nlohmann::json;

// Programmatically open a project file (board/schematic) in the running editor
// frame, without UI automation. Mirrors single_top.cpp's MacOpenFile path:
// the editor frame is the app's top window and is a KIWAY_PLAYER. Returns the
// result of OpenProjectFiles, or false if no frame is available — letting the
// JS caller fall back to driving File→Open.
//
// KICAD_MERGED_EMBIND (kicad_editor, editor-unification Part 2): eeschema_embind.cpp
// defines the identical function and registers the same JS names — in the merged image
// the frame-agnostic duplicates (this + kicadCollabOnSave) and the shared-name
// registrations live once in kicad_editor_embind.cpp, which dispatches the per-editor
// entries (renamed pcbCollab*/schCollab* below; JS-facing names are unchanged).
#ifndef KICAD_MERGED_EMBIND
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
#endif // !KICAD_MERGED_EMBIND

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

// Read an item's layer WITHOUT the virtual GetLayer(). That virtual mis-dispatches in the
// non-coroutine emit/snapshot context — it returns 0 (F_Cu) for EVERY item (the same asyncify
// call_indirect class as eeschema's Move()), which silently put every collab-added item/track/
// text on the top copper layer on the peer. A class-qualified `BOARD_ITEM::GetLayer()` is a
// statically-bound (direct) call that just reads m_layer, bypassing call_indirect. Zones keep
// their layer in m_layerSet (not m_layer), so use their non-virtual GetFirstLayer().
int itemLayer( BOARD_ITEM* aItem )
{
    if( aItem->Type() == PCB_ZONE_T )
        return (int) static_cast<ZONE*>( aItem )->GetFirstLayer();

    return (int) aItem->BOARD_ITEM::GetLayer();
}

// Iterate every board item the bridge syncs: the top-level items (tracks, footprints, drawings,
// zones, groups) PLUS each footprint's TEXT children (fields = reference/value/user, and graphic
// PCB_TEXT). The text children are visited by their OWN uuid because a silkscreen reference/value
// can be moved *independently* of its footprint (the footprint origin doesn't change, so syncing
// the footprint as a unit would miss it). Pads and footprint graphic shapes are NOT visited — they
// move only with the footprint. All these uuids live in BOARD::m_itemByIdCache, so apply resolves
// them directly. On a whole-footprint move the children also re-appear in the diff (their absolute
// positions changed); that's redundant but convergent, since apply uses absolute SetPosition.
template <typename Fn>
void forEachTopItem( BOARD& aBoard, Fn&& aFn )
{
    for( PCB_TRACK* t : aBoard.Tracks() )       aFn( static_cast<BOARD_ITEM*>( t ) );

    for( FOOTPRINT* f : aBoard.Footprints() )
    {
        aFn( static_cast<BOARD_ITEM*>( f ) );

        for( PCB_FIELD* fld : f->GetFields() )
        {
            if( fld )
                aFn( static_cast<BOARD_ITEM*>( fld ) );
        }

        for( BOARD_ITEM* g : f->GraphicalItems() )
        {
            if( g->Type() == PCB_TEXT_T )
                aFn( g );
        }
    }

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
        { "layer", itemLayer( aItem ) },   // devirtualized — aItem->GetLayer() mis-dispatches here
    };

    // Parent footprint uuid (or absent for roots). Carried in the baseline so a
    // REMOVED child can still be attributed to its parent after the live item is
    // gone — flushDiff lifts such removals to a parent re-blob on the v2 wire.
    if( FOOTPRINT* fp = aItem->GetParentFootprint() )
        j["parent"] = toUtf8( fp->m_Uuid.AsString() );

    if( isTrackType( aItem->Type() ) )
    {
        auto* tr   = static_cast<PCB_TRACK*>( aItem );
        j["sx"]    = tr->GetStart().x;
        j["sy"]    = tr->GetStart().y;
        j["ex"]    = tr->GetEnd().x;
        j["ey"]    = tr->GetEnd().y;
        j["width"] = tr->GetWidth();
    }

    // Vias and zones reconstruct NATIVELY on `added` (the s-expr clipboard blob's `(kicad_pcb …)`
    // envelope parse — used for footprints — is asyncify-fragile in wasm for these, the same wall
    // that deferred the eeschema symbol blob). So emit the geometry their makeItem needs.
    if( aItem->Type() == PCB_VIA_T )
    {
        auto* via  = static_cast<PCB_VIA*>( aItem );
        j["drill"] = via->GetDrillValue();
        j["ltop"]  = (int) via->TopLayer();
        j["lbot"]  = (int) via->BottomLayer();
    }
    else if( aItem->Type() == PCB_ZONE_T )
    {
        auto*                 zone = static_cast<ZONE*>( aItem );
        const SHAPE_POLY_SET* poly = zone->Outline();
        json                  pts  = json::array();

        if( poly && poly->OutlineCount() > 0 )
        {
            const SHAPE_LINE_CHAIN& chain = poly->COutline( 0 );

            for( int i = 0; i < chain.PointCount(); ++i )
            {
                const VECTOR2I& p = chain.CPoint( i );
                pts.push_back( { p.x, p.y } );
            }
        }

        j["poly"] = pts;
    }
    // A board-level graphic text (Place→Text) also reconstructs NATIVELY (same asyncify reason as
    // via/zone): emit its size / stroke / angle so makeItem can rebuild it. Footprint child text
    // is synced by move, not `added`, so this is only the board PCB_TEXT case.
    else if( aItem->Type() == PCB_TEXT_T )
    {
        auto* txt    = static_cast<PCB_TEXT*>( aItem );
        j["tw"]      = txt->GetTextSize().x;
        j["th"]      = txt->GetTextSize().y;
        j["thick"]   = txt->GetTextThickness();
        j["angle"]   = txt->GetTextAngle().AsTenthsOfADegree();
        // Justification + mirror anchor the glyphs relative to the text POSITION; without them a
        // left-justified text reconstructs centered and renders visibly offset from the same
        // GetPosition() (peers diverge visually though GetPosition matches). Bold/italic for looks.
        j["hjust"]   = (int) txt->GetHorizJustify();
        j["vjust"]   = (int) txt->GetVertJustify();
        j["mirror"]  = txt->IsMirrored();
        j["bold"]    = txt->IsBold();
        j["italic"]  = txt->IsItalic();
    }

    // Text items (incl. footprint fields / graphic text): carry the string so a move diff is
    // legible and a text `added` can reconstruct. Position-only sync uses x/y above.
    if( EDA_TEXT* txt = dynamic_cast<EDA_TEXT*>( aItem ) )
        j["text"] = toUtf8( txt->GetText() );

    return j;
}

// ── s-expr clipboard blob (the generic `added` mechanism) ────────────────────────────────────
//
// For added items beyond the natively-reconstructed PCB_TRACK (footprints, vias, zones, graphic
// shapes/text…), reuse KiCad's own copy/paste serializer, CLIPBOARD_IO. It Format()s a one-item
// selection exactly as Ctrl-C does — a bare `(footprint …)` for a footprint, or a fake
// `(kicad_pcb … <layers> <item>)` envelope for everything else (the bare item tokens like
// `(segment`/`(via`/`(zone` are NOT accepted by the parser top-level, so the envelope is
// required). CLIPBOARD_IO normally talks to the system clipboard; SetWriter/SetReader redirect
// it to a string so it works headless / in wasm.

// Serialize one live board item to a clipboard blob (used only for `added` payloads — NOT the
// diff unit, so `changed`/`removed` stay light and the blob never drives change detection).
//
// Footprints DON'T go through SaveSelection: its "make safe to transfer" step copies the
// footprint, and FOOTPRINT's copy ctor ASSIGNS the mandatory fields into the new footprint's
// freshly-constructed ones (`*existingField = *field`; EDA_ITEM::operator= keeps the target's
// uuid) — so Reference/Value/Datasheet/Description would carry NEW uuids in every blob,
// breaking the wire's identity-by-uuid (every emit would read as field remove+add, and round
// trips lose the field uuids). Instead we make the same safety copy ourselves, RESTORE the
// mandatory-field uuids from the source, and Format it directly — the same Format machinery
// SaveSelection uses internally, so asyncify behavior is identical.
std::string blobForItem( BOARD* aBoard, BOARD_ITEM* aItem )
{
    if( aItem->Type() == PCB_FOOTPRINT_T )
    {
        const FOOTPRINT* src = static_cast<const FOOTPRINT*>( aItem );
        FOOTPRINT        copy( *src );

        for( PCB_FIELD* field : copy.GetFields() )
        {
            if( field->IsMandatory() )
            {
                if( const PCB_FIELD* srcField = src->GetField( field->GetId() ) )
                    const_cast<KIID&>( field->m_Uuid ) = srcField->m_Uuid;
            }
        }

        // The rest of SaveSelection's footprint safety steps, minus the refPoint move
        // (the wire carries absolute positions) and minus SetNetCode(0): zeroing pad
        // nets is a paste-into-FOREIGN-board safety, but collab peers edit the SAME
        // board — nets must survive the wire. KiCad 10 formats pad nets by NAME and
        // the parser resolves by name against the receiver's board (creating the net
        // if missing), so no code remapping is needed on apply.
        copy.SetLocked( false );

        CLIPBOARD_IO     io;
        STRING_FORMATTER fmt;
        io.SetBoard( aBoard );
        io.SetOutputFormatter( &fmt );
        io.Format( &copy );

        copy.SetParent( nullptr );
        copy.SetParentGroup( nullptr );

        std::string out = fmt.GetString();
        KICAD_FORMAT::Prettify( out, KICAD_FORMAT::FORMAT_MODE::COMPACT_TEXT_PROPERTIES );
        return out;
    }

    PCB_SELECTION sel;
    sel.Add( aItem );                       // pointer-only insert; no mutation of the live item

    CLIPBOARD_IO io;
    io.SetBoard( aBoard );

    std::string out;
    io.SetWriter( [&out]( const wxString& s ) { out = std::string( s.utf8_str() ); } );
    io.SaveSelection( sel, /*isFootprintEditor*/ false );
    return out;
}

// Reconstruct a board item from a clipboard blob. Parse() returns a bare FOOTPRINT*, or a BOARD*
// (the `(kicad_pcb …)` envelope) holding the single item — in which case detach that item from
// the throw-away board and hand back ownership. Returns nullptr on a parse failure (Parse catches
// internally) or if no item is found. Runs inside the apply COROUTINE.
BOARD_ITEM* makeFromBlob( BOARD& aBoard, const std::string& aBlob )
{
    if( aBlob.empty() )
        return nullptr;

    CLIPBOARD_IO io;
    io.SetBoard( &aBoard );

    // Parse directly (not io.Parse(), whose catch(...) swallows the error): a
    // failed apply must say WHY, or wire bugs surface as silent non-convergence.
    BOARD_ITEM* parsed = nullptr;           // FOOTPRINT* (bare) | BOARD* (envelope) | nullptr

    try
    {
        parsed = io.PCB_IO_KICAD_SEXPR::Parse( wxString::FromUTF8( aBlob.c_str() ) );
    }
    catch( const IO_ERROR& e )
    {
        EM_ASM( { console.log( "[collab] pcbnew blob parse error: " + UTF8ToString( $0 ) ); },
                std::string( e.What().utf8_str() ).c_str() );
        return nullptr;
    }
    catch( ... )
    {
        EM_ASM( { console.log( "[collab] pcbnew blob parse error: unknown exception" ); } );
        return nullptr;
    }

    if( !parsed )
        return nullptr;

    if( parsed->Type() != PCB_T )
        return parsed;                      // bare footprint — ready to commit.Add

    // Envelope board: remap its net codes onto ours, then lift out the single item it carries.
    BOARD* clip = static_cast<BOARD*>( parsed );
    clip->MapNets( &aBoard );

    BOARD_ITEM* found = nullptr;

    if( !clip->Tracks().empty() )           found = clip->Tracks().front();      // track / via / arc
    else if( !clip->Zones().empty() )       found = clip->Zones().front();
    else if( !clip->Drawings().empty() )    found = clip->Drawings().front();    // shape / text / …
    else if( !clip->Footprints().empty() )  found = clip->Footprints().front();
    else if( !clip->Groups().empty() )      found = clip->Groups().front();

    if( found )
    {
        clip->Remove( found );              // detach so clip's dtor doesn't delete it
        // Reparent onto the REAL board before clip is freed: the item's m_parent still points at
        // clip, and commit.Push/saveCopyInUndoList dereferences GetParent() — a dangling pointer
        // here is what trapped via add ("index out of bounds") and tripped the zone undo assert.
        found->SetParent( &aBoard );
        found->SetParentGroup( nullptr );
    }

    delete clip;
    return found;
}

// Wrap a BARE item s-expr (e.g. one rendered from the Y.Doc Slot body) in the fake
// `(kicad_pcb …)` envelope CLIPBOARD_IO's parser requires for non-footprint items. The
// envelope carries the LIVE board's layer table so the item's layer names resolve — peers
// in a collab session share the same board, so names map 1:1. (Peer-emitted blobs already
// arrive enveloped by blobForItem; this is only for bare payloads.)
std::string wrapInBoardEnvelope( BOARD& aBoard, const std::string& aItemSexpr )
{
    std::string s = "(kicad_pcb (version " + std::to_string( SEXPR_BOARD_FILE_VERSION )
                    + ") (generator \"pcbnew\") (layers";

    for( PCB_LAYER_ID id : aBoard.GetEnabledLayers().Seq() )
    {
        const char* type = IsCopperLayer( id ) ? LAYER::ShowType( aBoard.GetLayerType( id ) )
                                               : "user";

        // CANONICAL name (LSET::Name), NOT GetLayerName(): the parser validates
        // position 2 against the fixed layer hash, and user-visible names differ
        // from canonical ones (e.g. "B.Courtyard" vs "B.CrtYd") — the envelope
        // parse threw "not in fixed layer hash" for any board with such layers.
        s += " (" + std::to_string( (int) id ) + " \""
             + std::string( LSET::Name( id ).utf8_str() ) + "\" " + type + ")";
    }

    s += ") " + aItemSexpr + ")";
    return s;
}

// Construct a new BOARD_ITEM from a delta item (for `added`), with the delta's uuid (m_Uuid is
// const → const_cast, exactly as the s-expr parser does). PCB_TRACK segments reconstruct natively
// from their fields (cheap, trap-free); every other type goes through the s-expr clipboard blob
// (`sexpr`, attached to added payloads by the emit side). Returns nullptr if neither applies.
BOARD_ITEM* makeItem( BOARD& aBoard, const json& j )
{
    std::string type = j.value( "type", "" );
    BOARD_ITEM* item = nullptr;

    if( type == "PCB_TRACK" && j.contains( "sx" ) )
    {
        auto* tr = new PCB_TRACK( &aBoard );
        tr->SetStart( VECTOR2I( j.value( "sx", 0 ), j.value( "sy", 0 ) ) );
        tr->SetEnd( VECTOR2I( j.value( "ex", 0 ), j.value( "ey", 0 ) ) );
        tr->SetWidth( j.value( "width", 0 ) );
        // SetLayer is virtual and (like GetLayer) mis-dispatches in this apply context → it no-ops,
        // leaving the item on the default layer. Class-qualify to a direct m_layer write.
        tr->BOARD_ITEM::SetLayer( (PCB_LAYER_ID) j.value( "layer", (int) F_Cu ) );
        item = tr;
    }
    // Via / zone: reconstruct natively from emitted geometry (the envelope-blob parse is
    // asyncify-fragile for these — see itemToJson). The blob is still emitted as a fallback.
    else if( type == "PCB_VIA" && j.contains( "drill" ) )
    {
        auto*    via = new PCB_VIA( &aBoard );
        VECTOR2I c( j.value( "x", 0 ), j.value( "y", 0 ) );
        via->SetPosition( c );
        via->SetWidth( j.value( "width", 0 ) );
        via->SetDrill( j.value( "drill", 0 ) );
        via->SetLayerPair( (PCB_LAYER_ID) j.value( "ltop", (int) F_Cu ),
                           (PCB_LAYER_ID) j.value( "lbot", (int) B_Cu ) );
        item = via;
    }
    else if( type == "ZONE" && j.contains( "poly" ) )
    {
        auto*                 zone = new ZONE( &aBoard );
        std::vector<VECTOR2I> outline;

        for( const json& p : j["poly"] )
        {
            if( p.is_array() && p.size() == 2 )
                outline.emplace_back( p[0].get<int>(), p[1].get<int>() );
        }

        // Zones keep their layer in m_layerSet via SetLayer→SetLayerSet (both virtual, both no-op
        // here). Class-qualify ZONE::SetLayerSet to set it directly (else GetFirstLayer == -1).
        zone->ZONE::SetLayerSet( LSET( { (PCB_LAYER_ID) j.value( "layer", (int) F_Cu ) } ) );

        if( outline.size() >= 3 )
            zone->AddPolygon( outline );

        item = zone;
    }
    else if( type == "PCB_TEXT" && j.contains( "text" ) )
    {
        auto* txt = new PCB_TEXT( &aBoard );
        txt->SetText( wxString::FromUTF8( j.value( "text", "" ).c_str() ) );
        txt->SetPosition( VECTOR2I( j.value( "x", 0 ), j.value( "y", 0 ) ) );
        txt->BOARD_ITEM::SetLayer( (PCB_LAYER_ID) j.value( "layer", (int) F_SilkS ) ); // devirt

        if( j.contains( "tw" ) )
            txt->SetTextSize( VECTOR2I( j.value( "tw", 0 ), j.value( "th", 0 ) ) );

        if( j.contains( "thick" ) )
            txt->SetTextThickness( j.value( "thick", 0 ) );

        if( j.contains( "angle" ) )
            txt->SetTextAngle( EDA_ANGLE( j.value( "angle", 0 ), TENTHS_OF_A_DEGREE_T ) );

        // Restore justification/mirror so the glyphs sit at the same place relative to position.
        if( j.contains( "hjust" ) )
            txt->SetHorizJustify( (GR_TEXT_H_ALIGN_T) j.value( "hjust", (int) GR_TEXT_H_ALIGN_LEFT ) );

        if( j.contains( "vjust" ) )
            txt->SetVertJustify( (GR_TEXT_V_ALIGN_T) j.value( "vjust", (int) GR_TEXT_V_ALIGN_CENTER ) );

        if( j.contains( "mirror" ) )
            txt->SetMirrored( j.value( "mirror", false ) );

        if( j.contains( "bold" ) )
            txt->SetBold( j.value( "bold", false ) );

        if( j.contains( "italic" ) )
            txt->SetItalic( j.value( "italic", false ) );

        item = txt;
    }
    else if( j.contains( "sexpr" ) )
    {
        item = makeFromBlob( aBoard, j.value( "sexpr", "" ) );
    }

    // Force the delta's uuid (the blob already carries the sender's uuid for the item and any
    // children, but set the top-level one explicitly to be certain peers agree on identity).
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

// Roots the listener saw change since the last flush (uuids, children lifted to
// their footprint at capture time). The scalar snapshot diff below is a LOSSY
// projection (id/type/x/y/layer + a few extras) — edits that don't move the
// projection (pad/zone property edits, anchor-centred rotations, endpoint drags)
// would otherwise never emit (bug 04). Dirty roots emit their v2 blob
// unconditionally; the wire apply is an idempotent upsert, so a false positive
// (a commit that changed nothing) costs one no-op echo.
std::set<std::string> g_dirty;

void noteDirty( BOARD_ITEM* aItem )
{
    if( !aItem )
        return;

    if( FOOTPRINT* fp = aItem->GetParentFootprint() )
        aItem = fp;

    g_dirty.insert( toUtf8( aItem->m_Uuid.AsString() ) );
}

// Re-seed the diff baseline to the current model — after handing out a seed snapshot, or after
// applying a remote delta (so those items aren't re-broadcast as a spurious local diff/echo).
// Declares "current model == broadcast state", so pending dirty marks are stale too.
void rebaseline()
{
    if( PCB_EDIT_FRAME* fr = pcbFrame() )
        g_baseline = snapshotByUuid( *fr->GetBoard() );

    g_dirty.clear();
}

// TARGETED rebaseline (bug 05): refresh baseline entries ONLY for the uuids a remote
// apply touched. A global rebaseline() here would fold a concurrently-committed local
// edit (its flush is queued BEHIND the apply on the same pending-event list) into the
// baseline and silently swallow it; with the targeted update the edit's uuids keep
// their pre-edit entries and the queued flush still emits it. Receiver-side cleanup
// the apply's Push produced likewise stays diffable — the post-apply flush broadcasts
// it, and re-application on the original sender is idempotent.
void rebaselineTouched( BOARD* aBoard, const std::vector<std::string>& aIds )
{
    for( const std::string& id : aIds )
    {
        // Drop the stale entry — and any child entries it owned (their parent
        // field carries the root uuid) — then re-snapshot whatever is live now.
        g_baseline.erase( id );

        for( auto it = g_baseline.begin(); it != g_baseline.end(); )
        {
            if( it->second.value( "parent", std::string() ) == id )
                it = g_baseline.erase( it );
            else
                ++it;
        }

        BOARD_ITEM* live = aBoard->ResolveItem( KIID( wxString::FromUTF8( id.c_str() ) ),
                                                /*allowNull*/ true );

        if( !live )
            continue;

        g_baseline[id] = itemToJson( live );

        if( live->Type() == PCB_FOOTPRINT_T )
        {
            FOOTPRINT* f = static_cast<FOOTPRINT*>( live );

            for( PCB_FIELD* fld : f->GetFields() )
            {
                if( fld )
                    g_baseline[toUtf8( fld->m_Uuid.AsString() )] = itemToJson( fld );
            }

            for( BOARD_ITEM* g : f->GraphicalItems() )
            {
                if( g->Type() == PCB_TEXT_T )
                    g_baseline[toUtf8( g->m_Uuid.AsString() )] = itemToJson( g );
            }
        }
    }
}

// Diff the current (settled, post-cleanup) model against the baseline and broadcast the change.
void flushDiff()
{
    g_flushScheduled = false;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    BOARD*                      board = fr->GetBoard();
    std::map<std::string, json> cur   = snapshotByUuid( *board );

    json added = json::array(), changed = json::array(), removed = json::array();

    // v2 items wire (per-item s-expr blobs): each touched id LIFTS to its root live
    // item (footprint children → the footprint), deduped, and the root is blobbed
    // whole — so containment travels and a child edit re-sends its parent subtree.
    json                  wAdded = json::array(), wChanged = json::array();
    std::set<std::string> wDone;

    auto liftBlob = [&]( const std::string& id, json& aArr )
    {
        BOARD_ITEM* live =
                board->ResolveItem( KIID( wxString::FromUTF8( id.c_str() ) ), /*allowNull*/ true );

        if( !live )
            return;

        bool lifted = false;

        if( FOOTPRINT* fp = live->GetParentFootprint() )
        {
            live = fp;
            lifted = true;
        }

        std::string rootId = toUtf8( live->m_Uuid.AsString() );

        if( !wDone.insert( rootId ).second )
            return;

        json w = json{ { "sexpr", blobForItem( board, live ) }, { "parent", nullptr } };

        // A lifted child means its (pre-existing) parent's CONTENT changed.
        ( lifted ? wChanged : aArr ).push_back( w );
    };

    for( const auto& [id, j] : cur )
    {
        auto it = g_baseline.find( id );

        if( it == g_baseline.end() )
        {
            liftBlob( id, wAdded );

            // Skip a newly-added footprint's text CHILDREN: the footprint's own add carries them,
            // and emitting a lone child would (for a field) wrap it in a spurious footprint. (A
            // child-only add onto an existing footprint is therefore not synced yet — rare.)
            BOARD_ITEM* live =
                    board->ResolveItem( KIID( wxString::FromUTF8( id.c_str() ) ), /*allowNull*/ true );

            if( live && live->GetParentFootprint() )
                continue;

            json withBlob = j;

            // Attach an s-expr clipboard blob ONLY for types makeItem reconstructs from it
            // (footprints, board graphics, …). Tracks/vias/zones/text rebuild NATIVELY from the
            // fields itemToJson already emitted, so they need no blob — and skipping it avoids a
            // wasted SaveSelection plus the asyncify-fragile envelope parse for those.
            if( live && !isTrackType( live->Type() ) && live->Type() != PCB_ZONE_T
                && live->Type() != PCB_TEXT_T )
                withBlob["sexpr"] = blobForItem( board, live );

            added.push_back( withBlob );
        }
        else if( it->second != j )
        {
            liftBlob( id, wChanged );
            changed.push_back( j );
        }
    }

    // v2 removals diverge from the legacy wire: a removed footprint CHILD whose
    // parent survives lifts to the parent's re-blob (wChanged) — the new body
    // carries the post-delete child set, and the receiver's parent-replace covers
    // the deletion. A bare child removal would strand a dangling {item} slot in
    // the Y-side parent body (bug 03). The legacy wire keeps the raw uuid list
    // (its receiver skips footprint children anyway).
    json wRemoved = json::array();

    for( const auto& [id, j] : g_baseline )
    {
        if( cur.count( id ) )
            continue;

        removed.push_back( id );

        std::string parentId = j.value( "parent", std::string() );

        if( !parentId.empty() && cur.count( parentId ) )
            liftBlob( parentId, wChanged );
        else
            wRemoved.push_back( id );
    }

    // Dirty roots (bug 04): whatever the listener saw commit emits its blob on
    // the v2 wire even when the scalar projection didn't move. wDone dedups
    // against the scalar-diff emits above; deleted ids resolve null and skip.
    for( const std::string& id : g_dirty )
        liftBlob( id, wChanged );

    g_dirty.clear();

    g_baseline = std::move( cur );

    if( !added.empty() || !changed.empty() || !removed.empty() )
        emit( json{ { "added", added }, { "changed", changed }, { "removed", removed } } );

    if( !wAdded.empty() || !wChanged.empty() || !wRemoved.empty() )
        emitItems( json{ { "added", wAdded }, { "changed", wChanged }, { "removed", wRemoved } } );
}

// Coalesce all the listener callbacks of one commit (and any other edits in the same loop
// turn) into a single post-settle diff.
// flushDiff runs inside a COROUTINE: the v2 items emit serializes ROOT items via
// CLIPBOARD_IO Format (blobForItem), whose virtual dispatch is only reliable on the
// libcontext fiber stack — on the bare CallAfter stack it can trap and silently kill
// the whole flush, legacy emit included (same lesson as doApply / eeschema 0007).
void scheduleFlush()
{
    if( g_flushScheduled )
        return;

    g_flushScheduled = true;

    if( PCB_EDIT_FRAME* fr = pcbFrame() )
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

// Presence (collab-presence 0002): board changes often change the selection too
// (delete, paste) with no closing canvas event — piggyback a selection re-check
// on the collab listener trigger. Defined in the presence section below.
void schedulePresenceSelCheck();

// ChangeSource: the native BOARD_LISTENER is just a trigger — the actual change set comes from
// the post-settle snapshot diff above. Skipped while applying a remote delta (no echo); doApply
// rebaselines instead. OnBoardCompositeUpdate (the single combined add/remove/change event,
// 0004) plus the bulk + singular callbacks all funnel into one trigger.
class COLLAB_LISTENER : public BOARD_LISTENER
{
public:
    void OnBoardItemAdded( BOARD&, BOARD_ITEM* i ) override                     { trigger( { i } ); }
    void OnBoardItemsAdded( BOARD&, std::vector<BOARD_ITEM*>& v ) override      { trigger( v ); }
    void OnBoardItemRemoved( BOARD&, BOARD_ITEM* i ) override                   { trigger( { i } ); }
    void OnBoardItemsRemoved( BOARD&, std::vector<BOARD_ITEM*>& v ) override    { trigger( v ); }
    void OnBoardItemChanged( BOARD&, BOARD_ITEM* i ) override                   { trigger( { i } ); }
    void OnBoardItemsChanged( BOARD&, std::vector<BOARD_ITEM*>& v ) override    { trigger( v ); }
    void OnBoardCompositeUpdate( BOARD&, std::vector<BOARD_ITEM*>& a,
                                 std::vector<BOARD_ITEM*>& r,
                                 std::vector<BOARD_ITEM*>& c ) override
    {
        trigger( a );
        trigger( r );
        trigger( c );
    }

private:
    // Capture the touched roots at callback time (uuid strings — removed items
    // may be freed before the flush runs), then coalesce into one flush.
    void trigger( const std::vector<BOARD_ITEM*>& aItems )
    {
        if( s_applyingRemote )
            return;

        for( BOARD_ITEM* item : aItems )
            noteDirty( item );

        scheduleFlush();
        schedulePresenceSelCheck();
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
            // A footprint text child appears in `removed` when its whole footprint was deleted
            // (it vanished from the sender's snapshot). Removing the footprint cascades to its
            // children, so don't also remove the child here — that would double-remove. (A rare
            // child-only delete with the footprint kept is therefore not synced; acceptable.)
            if( item->GetParentFootprint() )
                continue;

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

// v2 items apply: removed by uuid; added/changed are an idempotent per-item upsert —
// parse the blob (wrapping bare non-footprint payloads in a live-board envelope),
// then replace any existing item sharing the parsed uuid. Runs inside the apply
// COROUTINE (see kicadCollabApplyItems), via BOARD_COMMIT like every remote op.
void doApplyItems( PCB_EDIT_FRAME* aFrame, const json& aWire )
{
    BOARD* board = aFrame->GetBoard();

    s_applyingRemote = true;

    BOARD_COMMIT commit( aFrame );
    bool         staged = false;

    std::vector<std::string> touched;   // root uuids this apply acts on (targeted rebaseline)

    std::set<std::string> removedIds;

    for( const json& rid : aWire.value( "removed", json::array() ) )
        removedIds.insert( rid.get<std::string>() );

    for( const std::string& rid : removedIds )
    {
        KIID id( wxString::FromUTF8( rid.c_str() ) );

        touched.push_back( rid );

        if( BOARD_ITEM* item = board->ResolveItem( id, /*allowNullptr*/ true ) )
        {
            if( FOOTPRINT* pfp = item->GetParentFootprint() )
            {
                // Covered by the parent's own removal when the whole footprint
                // goes. A BARE child removal must remove the child itself
                // (bug 03 receiving half) — the sender now lifts these to a
                // parent re-blob, but Y-rendered wires can still carry them.
                if( removedIds.count( toUtf8( pfp->m_Uuid.AsString() ) ) )
                    continue;
            }

            commit.Remove( item );
            staged = true;
        }
    }

    auto upsert = [&]( const json& w )
    {
        std::string sexpr = w.value( "sexpr", "" );
        size_t      p     = sexpr.find_first_not_of( " \t\r\n" );

        if( p == std::string::npos )
            return;

        std::string trimmed = sexpr.substr( p );

        // Peer-emitted blobs are already enveloped (or a bare footprint, which the
        // parser accepts top-level); bare Y.Doc-rendered items need the envelope.
        if( trimmed.rfind( "(kicad_pcb", 0 ) != 0 && trimmed.rfind( "(footprint", 0 ) != 0 )
            trimmed = wrapInBoardEnvelope( *board, trimmed );

        BOARD_ITEM* parsed = makeFromBlob( *board, trimmed );

        if( !parsed )
        {
            EM_ASM( { console.log( "[collab] pcbnew applyItems: blob parse failed" ); } );
            return;
        }

        if( BOARD_ITEM* existing = board->ResolveItem( parsed->m_Uuid, /*allowNullptr*/ true ) )
        {
            // Replacing by uuid; a (shouldn't-happen) child match replaces its parent.
            if( FOOTPRINT* fp = existing->GetParentFootprint() )
                existing = fp;

            commit.Remove( existing );
        }

        touched.push_back( toUtf8( parsed->m_Uuid.AsString() ) );

        commit.Add( parsed );
        staged = true;
    };

    for( const json& w : aWire.value( "added", json::array() ) )
        upsert( w );
    for( const json& w : aWire.value( "changed", json::array() ) )
        upsert( w );

    if( staged )
        commit.Push( wxT( "Collaborative edit (items)" ) );

    // Fold ONLY the applied uuids into the baseline (echo suppression), then flush:
    // anything else that now differs — a concurrent local edit, cleanup this apply's
    // Push produced — broadcasts as a normal local diff instead of being swallowed.
    rebaselineTouched( board, touched );
    s_applyingRemote = false;
    scheduleFlush();
}

// Test/PoC move (the BOARD_COMMIT body for kicadCollabTestMoveFirst). Run inside a COROUTINE by
// the caller: `BOARD_ITEM::Move` is virtual, and dispatched off the app main stack (a bare
// CallAfter) it hits the asyncify call_indirect mis-dispatch and silently NO-OPS — the commit
// dirties the board but the item doesn't move. On the fiber stack (where native tool edits and
// doApply run) it dispatches correctly. (Same lesson as eeschema's devirtualized move.)
void collabTestMove( PCB_EDIT_FRAME* aFrame, BOARD_ITEM* aItem, int aDx, int aDy )
{
    BOARD_COMMIT commit( aFrame );
    commit.Modify( aItem );
    aItem->Move( VECTOR2I( aDx, aDy ) );
    commit.Push( wxT( "Collab test move" ) );
}

// ───────────────────────── collab presence (collab-presence 0002) ─────────────────────────
//
// Ephemeral presence: emit THIS tab's selection + cursor to JS (they ride Yjs awareness),
// and render REMOTE peers' cursors + selection outlines into a per-user-colored
// KIGFX::VIEW_OVERLAY. Never via the SELECTED/BRIGHTENED item flags — those have one
// global color and mutate real selection state (events, serialization, races with the
// local user); the overlay's command list takes a COLOR4D per command, never enters
// m_selection, and never serializes.
//
// Zero kicad-fork changes: the input triggers are wx-layer Bind() handlers on the GAL
// canvas (bound after WX_VIEW_CONTROLS' own, so they run FIRST and Skip() onward), the
// selection is read from PCB_SELECTION_TOOL after the event settles (CallAfter), and the
// repaint is the MakeOverlay()/VIEW::Update()/ForceRefresh() combo the cross-probe flash
// already uses. Selection changes with no closing canvas event (Edit→Select All from the
// menu) are missed until the next input or board change — acceptable for an ephemeral
// layer that fully resyncs on every emit.
namespace presence {

struct PEER
{
    std::string       name;
    KIGFX::COLOR4D    color;
    bool              hasCursor = false;
    VECTOR2D          cursor;            // world coords (IU/nm)
    std::vector<KIID> selection;
};

// Comment pin dot (collab-presence 0005): the GAL half of the hybrid pin —
// zero pan/zoom lag; the clickable hit target + thread popover are DOM,
// positioned via the exported viewport transform.
struct PIN
{
    std::string    id;
    std::string    name;                 // author (palette-override rehash key)
    VECTOR2D       pos;                  // world coords (IU)
    KIGFX::COLOR4D color;
    bool           resolved = false;
};

std::vector<PEER>                    g_peers;
std::vector<PIN>                     g_pins;
// Every visual knob (shapes, widths, alphas, label placement, color overrides)
// — see collab_presence_style.h; live-patched by kicadCollabSetStyle (tuner).
pcbjam_presence::STYLE               g_style;
std::shared_ptr<KIGFX::VIEW_OVERLAY> g_overlay;
bool        g_started         = false;
bool        g_redrawScheduled = false;
bool        g_selCheckScheduled = false;
std::string g_lastSelectionJson;   // dedupe: emit only when the uuid set changed
long long   g_lastCursorEmitMs = 0;
double      g_lastVpScale  = 0.0;
VECTOR2D    g_lastVpCenter;

long long nowMs()
{
    return std::chrono::duration_cast<std::chrono::milliseconds>(
                   std::chrono::steady_clock::now().time_since_epoch() )
            .count();
}

KIGFX::COLOR4D parseColor( const std::string& aHex )
{
    if( aHex.size() == 7 && aHex[0] == '#' )
    {
        long v = strtol( aHex.c_str() + 1, nullptr, 16 );
        return KIGFX::COLOR4D( ( ( v >> 16 ) & 0xff ) / 255.0, ( ( v >> 8 ) & 0xff ) / 255.0,
                               ( v & 0xff ) / 255.0, 0.9 );
    }

    return KIGFX::COLOR4D( 0.23, 0.51, 0.96, 0.9 ); // palette blue fallback
}

json selectionUuids( PCB_EDIT_FRAME* aFrame )
{
    json uuids = json::array();

    PCB_SELECTION_TOOL* selTool = aFrame->GetToolManager()->GetTool<PCB_SELECTION_TOOL>();

    if( !selTool )
        return uuids;

    for( EDA_ITEM* item : selTool->GetSelection() )
        uuids.push_back( toUtf8( item->m_Uuid.AsString() ) );

    return uuids;
}

// Post-settle selection emit: read the selection AFTER the triggering event finished
// (CallAfter), dedupe against the last emitted set, hand the uuid list to JS.
void checkSelection()
{
    g_selCheckScheduled = false;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    std::string s = selectionUuids( fr ).dump();

    if( s == g_lastSelectionJson )
        return;

    g_lastSelectionJson = s;

    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onSelection )
            window.kicadCollab.onSelection( UTF8ToString( $0 ) );
    }, s.c_str() );
}

// Repaint the remote-peers overlay. Runs in CallAfter + COROUTINE: the first
// MakeOverlay() view->Add and each item's virtual ViewBBox() need the fiber stack
// (asyncify virtual dispatch — same constraint as doApply above).
void redrawOverlay()
{
    g_redrawScheduled = false;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    KIGFX::VIEW* view = fr->GetCanvas()->GetView();

    if( !g_overlay )
        g_overlay = pcbjam_presence::makePresenceOverlay( view );

    g_overlay->Clear();

    BOARD* board = fr->GetBoard();
    // Screen-constant sizing: px → world units, so cursors/outline widths don't
    // scale with zoom. MUST go through the GAL matrix (ToWorld(double)) — the
    // naive 1/GetScale() is the ZOOM factor, not px-per-IU (the GAL world-unit
    // scale is folded into the matrix only), and it under-sizes the drawing by
    // ~7 orders of magnitude (invisible cursors).
    double px = view->ToWorld( 1.0 );

    // All shapes/sizes/placements come from g_style (collab_presence_style.h);
    // the drawing itself is shared with eeschema's TU so the editors never
    // diverge visually.
    for( const PEER& peer : g_peers )
    {
        KIGFX::COLOR4D color = pcbjam_presence::peerColor( g_style, peer.name, peer.color );

        for( const KIID& id : peer.selection )
        {
            BOARD_ITEM* item = board->ResolveItem( id, /*aAllowNullptrReturn*/ true );

            if( !item )
                continue;   // not on this board (yet) — skip silently

            // Exact-geometry outline (style shape 5): footprints hug their
            // bounding hull, everything else its transformed shape. Runs on
            // the coroutine fiber (virtual dispatch), falls back to the bbox
            // on anything that can't produce a polygon.
            SHAPE_POLY_SET outline;

            if( g_style.selShape == 5 )
            {
                try
                {
                    int pad = KiROUND( g_style.selPaddingPx * px );
                    int err = KiROUND( px ) + 1;

                    if( item->Type() == PCB_FOOTPRINT_T )
                    {
                        outline = static_cast<FOOTPRINT*>( item )->GetBoundingHull();

                        if( pad > 0 )
                            outline.Inflate( pad, CORNER_STRATEGY::ROUND_ALL_CORNERS, err );
                    }
                    else
                    {
                        item->TransformShapeToPolygon( outline, (PCB_LAYER_ID) itemLayer( item ),
                                                       pad, err, ERROR_OUTSIDE );
                    }
                }
                catch( ... )
                {
                    outline.RemoveAllContours();
                }
            }

            pcbjam_presence::drawSelectionBox( g_overlay.get(), item->ViewBBox(), peer.name,
                                               color, px, g_style, &outline );
        }

        if( peer.hasCursor )
            pcbjam_presence::drawCursor( g_overlay.get(), peer.cursor, peer.name, color, px,
                                         g_style );
    }

    // Comment pin dots (0005), drawn last so they sit above selection outlines.
    for( const PIN& pin : g_pins )
    {
        KIGFX::COLOR4D color = pcbjam_presence::peerColor( g_style, pin.name, pin.color );
        pcbjam_presence::drawPin( g_overlay.get(), pin.pos, color, pin.resolved, px, g_style );
    }

    view->Update( g_overlay.get() );
    // The canvas repaints on its own only with focus/input — force it, exactly as
    // the cross-probe flash does.
    fr->GetCanvas()->ForceRefresh();
}

void scheduleRedraw()
{
    if( g_redrawScheduled )
        return;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    g_redrawScheduled = true;

    fr->CallAfter( []() {
        COROUTINE<int, int> cor( []( int ) -> int
                                 {
                                     redrawOverlay();
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );
}

// Viewport emit (world→screen mapping for the React comment/DOM layer, 0005): pushed
// when the view center/scale changed (checked from the input handlers below), pulled
// any time via kicadCollabGetViewport. Zoom also invalidates the overlay's
// screen-constant sizes, so a change schedules a redraw too.
void emitViewportIfChanged()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    KIGFX::VIEW* view  = fr->GetCanvas()->GetView();
    double       scale = view->GetScale();   // zoom — cheap change detector only
    VECTOR2D     c     = view->GetCenter();

    if( scale == g_lastVpScale && c == g_lastVpCenter )
        return;

    g_lastVpScale  = scale;
    g_lastVpCenter = c;

    const VECTOR2I& sz = view->GetScreenPixelSize();
    // px per IU via the GAL matrix — GetScale() is the zoom, not px/IU.
    double pxPerIu = view->ToScreen( 1.0 );

    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onViewport )
            window.kicadCollab.onViewport( $0, $1, $2, $3, $4 );
    }, c.x, c.y, pxPerIu, sz.x, sz.y );

    if( !g_peers.empty() )
        scheduleRedraw();
}

void emitCursor( double aX, double aY, bool aActive )
{
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onCursor )
            window.kicadCollab.onCursor( $0, $1, $2 );
    }, aX, aY, aActive ? 1 : 0 );
}

void onMotion( wxMouseEvent& aEvt )
{
    aEvt.Skip();

    long long now = nowMs();

    if( now - g_lastCursorEmitMs < 50 )     // ≤20 emits/s, event-driven (no timers)
        return;

    g_lastCursorEmitMs = now;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    // Screen→world via the non-virtual VIEW::ToWorld (the virtual
    // VIEW_CONTROLS::GetMousePosition is an asyncify dispatch risk here).
    wxPoint  p     = aEvt.GetPosition();
    VECTOR2D world = fr->GetCanvas()->GetView()->ToWorld( VECTOR2D( p.x, p.y ), true );

    emitCursor( world.x, world.y, true );
    emitViewportIfChanged();                // catches drag-pan while moving
}

void onLeave( wxMouseEvent& aEvt )
{
    aEvt.Skip();
    emitCursor( 0, 0, false );
}

} // namespace presence

void schedulePresenceSelCheck()
{
    if( presence::g_selCheckScheduled )
        return;

    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    presence::g_selCheckScheduled = true;
    fr->CallAfter( []() { presence::checkSelection(); } );
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
void pcbCollabApply( std::string aJson )
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


// JS → C++, v2 items wire. Same CallAfter + COROUTINE context as kicadCollabApply
// (the blob parse + commit must run where native edits run — see above).
void pcbCollabApplyItems( std::string aJson )
{
    json wire = json::parse( aJson, nullptr, /*allow_exceptions*/ false );

    if( wire.is_discarded() )
        return;

    PCB_EDIT_FRAME* fr = pcbFrame();

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


// JS pull of the full current model as an all-"added" delta (seed/baseline). Also registers the
// change listener on first call.
std::string pcbCollabSnapshot()
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


// JS pull of the full current model as an all-"added" v2 items wire: one blob per ROOT
// item (a footprint's blob embeds its children — the TS side flattens). Registers the
// listener + rebaselines exactly like kicadCollabSnapshot.
std::string pcbCollabSnapshotItems()
{
    BOARD* board = ensureBridge();

    json added = json::array();

    if( board )
    {
        auto push = [&]( BOARD_ITEM* item )
        {
            added.push_back( json{ { "sexpr", blobForItem( board, item ) }, { "parent", nullptr } } );
        };

        for( FOOTPRINT* fp : board->Footprints() )  push( fp );
        for( PCB_TRACK* t : board->Tracks() )       push( t );
        for( ZONE* z : board->Zones() )             push( z );
        for( BOARD_ITEM* d : board->Drawings() )    push( d );
    }

    rebaseline();

    return json{ { "added", added }, { "changed", json::array() },
                 { "removed", json::array() } }.dump();
}


// Programmatically save the in-memory board to a .kicad_pcb file, without driving
// the Save As dialog — pcbnew's analogue of pl_editor's kicadSaveDrawingSheet.
// Serializes exactly what the editor has loaded via the same writer eeschema/pcbnew
// use, so a test can read the file back from MEMFS and assert the file ⇄ Y.Doc
// round trip (README §A; feature 0004). Uses only public PCB_IO_KICAD_SEXPR API.
// C++ → JS save notification (standalone-hardening save routing). Called from the
// kicad fork's save chokepoint (PCB_EDIT_FRAME::SavePcbFile) after a successful
// write to MEMFS, so the web app can route the saved bytes onward (API upload,
// local-disk write-back, download). No-op without a JS listener.
// KICAD_MERGED_EMBIND: identical definition in eeschema_embind.cpp; the merged image
// gets the one in kicad_editor_embind.cpp (both fork save chokepoints call it).
#ifndef KICAD_MERGED_EMBIND
extern "C" void kicadCollabOnSave( const char* aPath )
{
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onSave )
            window.kicadCollab.onSave( UTF8ToString( $0 ) );
    }, aPath );
}
#endif // !KICAD_MERGED_EMBIND

// Merged-image dispatch probe (kicad_editor_embind.cpp): is the active top window the
// PCB editor? Each shared JS entry routes to the pcb*/sch* implementation whose frame
// is live — exactly the null-check its body starts with anyway.
bool pcbEditorActive()
{
    return pcbFrame() != nullptr;
}


void kicadSaveBoard( std::string path )
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    BOARD* board = fr->GetBoard();

    if( !board )
        return;

    try
    {
        PCB_IO_KICAD_SEXPR io;
        io.SaveBoard( wxString::FromUTF8( path.c_str() ), board );
    }
    catch( ... )
    {
        // Don't abort the wasm runtime on a save failure; the JS caller detects it
        // by the file being absent / empty.
    }
}


// Test/PoC helper: move the first top-level board item by (dx,dy) IU via a real BOARD_COMMIT,
// firing the listener — a deterministic local edit for the two-tab demo / e2e. Returns the
// moved item's uuid.
std::string pcbCollabTestMoveFirst( int aDx, int aDy )
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
                        // Run on the app main stack (CallAfter) AND inside a COROUTINE fiber, so
                        // the virtual Move() dispatches instead of no-opping — same wrapping as
                        // kicadCollabApply's doApply.
                        fr->CallAfter( [fr, item, aDx, aDy]() {
                            COROUTINE<int, int> cor( [fr, item, aDx, aDy]( int ) -> int
                                                     {
                                                         collabTestMove( fr, item, aDx, aDy );
                                                         return 0;
                                                     } );
                            cor.Call( 0 );
                        } );
                    } );

    return movedId;
}


// Test helper: read an item's position by uuid as "x,y" (internal units).
std::string pcbCollabGetPos( std::string aId )
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


// ── presence entry points (collab-presence 0002) ────────────────────────────────────────────

// Install the presence input hooks on the GAL canvas (idempotent). Called by the JS
// presence binding at collab attach; also implied by the first kicadCollabSetRemote.
// Handlers Skip() so WX_VIEW_CONTROLS' own processing is untouched; selection checks
// run POST-event via CallAfter (the selection tool acts on the same event after us).
void pcbCollabPresenceStart()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr || presence::g_started )
        return;

    presence::g_started = true;

    wxWindow* canvas = fr->GetCanvas();

    canvas->Bind( wxEVT_MOTION, []( wxMouseEvent& e ) { presence::onMotion( e ); } );
    canvas->Bind( wxEVT_LEAVE_WINDOW, []( wxMouseEvent& e ) { presence::onLeave( e ); } );

    auto selAndViewport = []( wxEvent& e )
    {
        e.Skip();
        schedulePresenceSelCheck();

        if( PCB_EDIT_FRAME* f = pcbFrame() )
            f->CallAfter( []() { presence::emitViewportIfChanged(); } );
    };

    canvas->Bind( wxEVT_LEFT_UP, [selAndViewport]( wxMouseEvent& e ) { selAndViewport( e ); } );
    canvas->Bind( wxEVT_RIGHT_UP, [selAndViewport]( wxMouseEvent& e ) { selAndViewport( e ); } );
    canvas->Bind( wxEVT_KEY_UP, [selAndViewport]( wxKeyEvent& e ) { selAndViewport( e ); } );
    canvas->Bind( wxEVT_MOUSEWHEEL, [selAndViewport]( wxMouseEvent& e ) { selAndViewport( e ); } );
}

// JS → C++: full remote-peers snapshot — `{peers:[{id,name,color,cursor:{x,y}|null,
// selection:[uuid]}]}`, trivially derived from awareness.getStates() and idempotent
// (the overlay is cleared + fully redrawn). An empty peers list clears the overlay.
void pcbCollabSetRemote( std::string aJson )
{
    json j = json::parse( aJson, nullptr, /*allow_exceptions*/ false );

    if( j.is_discarded() )
        return;

    std::vector<presence::PEER> peers;

    for( const json& p : j.value( "peers", json::array() ) )
    {
        presence::PEER peer;
        peer.name  = p.value( "name", "" );
        peer.color = presence::parseColor( p.value( "color", "" ) );

        if( p.contains( "cursor" ) && p["cursor"].is_object() )
        {
            peer.hasCursor = true;
            peer.cursor    = VECTOR2D( p["cursor"].value( "x", 0.0 ), p["cursor"].value( "y", 0.0 ) );
        }

        for( const json& u : p.value( "selection", json::array() ) )
        {
            if( u.is_string() )
                peer.selection.emplace_back( wxString::FromUTF8( u.get<std::string>().c_str() ) );
        }

        peers.push_back( std::move( peer ) );
    }

    presence::g_peers = std::move( peers );
    pcbCollabPresenceStart();
    presence::scheduleRedraw();
}

// JS → C++ (collab-presence 0005): comment pin dots — `{pins:[{id,x,y,color,
// resolved}]}`, world IU coords resolved by the TS side from the ydoc anchors.
// Snapshot semantics like SetRemote: cleared + fully redrawn each push.
void pcbCollabSetPins( std::string aJson )
{
    json j = json::parse( aJson, nullptr, /*allow_exceptions*/ false );

    if( j.is_discarded() )
        return;

    std::vector<presence::PIN> pins;

    for( const json& p : j.value( "pins", json::array() ) )
    {
        presence::PIN pin;
        pin.id       = p.value( "id", "" );
        pin.name     = p.value( "name", "" );
        pin.pos      = VECTOR2D( p.value( "x", 0.0 ), p.value( "y", 0.0 ) );
        pin.color    = presence::parseColor( p.value( "color", "" ) );
        pin.resolved = p.value( "resolved", false );
        pins.push_back( std::move( pin ) );
    }

    presence::g_pins = std::move( pins );
    pcbCollabPresenceStart();
    presence::scheduleRedraw();
}

// JS → C++ (presence tuner): live-patch the overlay STYLE (partial JSON —
// see collab_presence_style.h) and repaint. Dev-time only in practice, but
// harmless in production (nothing calls it without VITE_PRESENCE_TUNER).
void pcbCollabSetStyle( std::string aJson )
{
    json j = json::parse( aJson, nullptr, /*allow_exceptions*/ false );

    if( j.is_discarded() )
        return;

    pcbjam_presence::patchStyle( presence::g_style, j );
    presence::scheduleRedraw();
}

// Tuner helper: a VARIED demo-selection set — labeled uuid groups (smallest +
// largest footprint, the two busiest nets' track segments) so the style
// preview shows the real range of shapes instead of two overlapping items.
std::string pcbCollabTestDemoSet()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    json groups = json::array();

    if( fr )
    {
        BOARD* board = fr->GetBoard();

        // Footprints by bbox area → smallest and largest.
        FOOTPRINT* smallest = nullptr;
        FOOTPRINT* largest  = nullptr;
        double     minA = 0, maxA = 0;

        for( FOOTPRINT* f : board->Footprints() )
        {
            BOX2I  bb = f->GetBoundingBox();
            double a  = (double) bb.GetWidth() * bb.GetHeight();

            if( !smallest || a < minA ) { smallest = f; minA = a; }
            if( !largest || a > maxA )  { largest = f;  maxA = a; }
        }

        if( smallest )
            groups.push_back( { { "label", "fp small (" + toUtf8( smallest->GetReference() ) + ")" },
                                { "ids", { toUtf8( smallest->m_Uuid.AsString() ) } } } );

        if( largest && largest != smallest )
            groups.push_back( { { "label", "fp large (" + toUtf8( largest->GetReference() ) + ")" },
                                { "ids", { toUtf8( largest->m_Uuid.AsString() ) } } } );

        // Tracks grouped by net → the two busiest nets (capped segment lists).
        std::map<std::string, std::vector<std::string>> nets;

        for( PCB_TRACK* t : board->Tracks() )
        {
            std::string net = toUtf8( t->GetNetname() );

            if( !net.empty() )
                nets[net].push_back( toUtf8( t->m_Uuid.AsString() ) );
        }

        std::vector<std::pair<std::string, std::vector<std::string>>> byCount( nets.begin(),
                                                                               nets.end() );
        std::sort( byCount.begin(), byCount.end(),
                   []( const auto& a, const auto& b ) { return a.second.size() > b.second.size(); } );

        for( size_t i = 0; i < byCount.size() && i < 2; ++i )
        {
            auto ids = byCount[i].second;

            if( ids.size() > 12 )
                ids.resize( 12 );

            groups.push_back( { { "label", "net " + byCount[i].first }, { "ids", ids } } );
        }
    }

    return json{ { "groups", groups } }.dump();
}

// Test/tuner helper: the first N top-level item uuids — real, resolvable KIIDs
// for synthetic remote-selection previews (a solo tab has no peer to borrow from).
std::string pcbCollabTestListItems( int aCount )
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    json out = json::array();

    if( fr )
    {
        forEachTopItem( *fr->GetBoard(), [&]( BOARD_ITEM* item )
                        {
                            if( (int) out.size() < aCount && !item->GetParentFootprint() )
                                out.push_back( toUtf8( item->m_Uuid.AsString() ) );
                        } );
    }

    return out.dump();
}

// JS → C++ (0005): pan the view to a world position (comment panel "jump to
// pin"). CallAfter + COROUTINE like every other view mutation from JS.
void pcbCollabSetViewport( double aCx, double aCy )
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return;

    fr->CallAfter( [fr, aCx, aCy]() {
        COROUTINE<int, int> cor( [fr, aCx, aCy]( int ) -> int
                                 {
                                     fr->GetCanvas()->GetView()->SetCenter( VECTOR2D( aCx, aCy ) );
                                     fr->GetCanvas()->ForceRefresh();
                                     presence::emitViewportIfChanged();
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );
}

// JS pull of the current viewport transform (world↔screen mapping for the DOM layer):
// `{cx,cy,scale,w,h}` — world center, pixels-per-IU scale, canvas size in px.
std::string pcbCollabGetViewport()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return "";

    KIGFX::VIEW*    view = fr->GetCanvas()->GetView();
    VECTOR2D        c    = view->GetCenter();
    const VECTOR2I& sz   = view->GetScreenPixelSize();

    // scale = px per IU via the GAL matrix (GetScale() is the zoom, not px/IU).
    return json{ { "cx", c.x }, { "cy", c.y }, { "scale", view->ToScreen( 1.0 ) },
                 { "w", sz.x }, { "h", sz.y } }.dump();
}

// JS pull of the CURRENT selection's uuids (presence seed at attach + the e2e's
// no-state-leak probe: a remote render must leave this empty).
std::string pcbCollabGetSelection()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return "[]";

    return presence::selectionUuids( fr ).dump();
}

// Test helper: REALLY select the first top-level item through the selection tool (the
// same call the cross-probe flash uses), then run the presence check — a programmatic
// select has no closing canvas event. Returns the selected uuid.
std::string pcbCollabTestSelectFirst()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return "";

    BOARD_ITEM* target = nullptr;

    forEachTopItem( *fr->GetBoard(), [&]( BOARD_ITEM* item )
                    {
                        if( !target )
                            target = item;
                    } );

    if( !target )
        return "";

    fr->CallAfter( [fr, target]() {
        if( PCB_SELECTION_TOOL* st = fr->GetToolManager()->GetTool<PCB_SELECTION_TOOL>() )
        {
            st->AddItemToSel( target );
            schedulePresenceSelCheck();
        }
    } );

    return toUtf8( target->m_Uuid.AsString() );
}

// Test helper: clear the selection through the tool + run the presence check.
bool pcbCollabTestClearSelection()
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return false;

    fr->CallAfter( [fr]() {
        if( PCB_SELECTION_TOOL* st = fr->GetToolManager()->GetTool<PCB_SELECTION_TOOL>() )
        {
            st->ClearSelection();
            schedulePresenceSelCheck();
        }
    } );

    return true;
}

// Test helper: the s-expr clipboard blob for an item by uuid (what the emit side attaches to an
// `added` payload). Lets the e2e round-trip the blob add path without a real draw.
std::string kicadCollabTestItemBlob( std::string aId )
{
    PCB_EDIT_FRAME* fr = pcbFrame();

    if( !fr )
        return "";

    BOARD* board = fr->GetBoard();

    if( BOARD_ITEM* item = board->ResolveItem( KIID( wxString::FromUTF8( aId.c_str() ) ),
                                               /*allowNullptr*/ true ) )
    {
        return blobForItem( board, item );
    }

    return "";
}

// ── ysync-review repro hooks ─────────────────────────────────────────────────
// Local-edit test hooks for the ysync-review repro e2e (docs/features/
// ysync-review on the ysync-review branch): each drives a REAL BOARD_COMMIT on
// the app main stack inside a COROUTINE fiber (the collabTestMove wrapping —
// virtual item mutators mis-dispatch off the fiber stack), so the
// COLLAB_LISTENER → flushDiff emit path runs exactly as for a UI edit. Each
// returns false when the uuid doesn't resolve, letting the spec distinguish
// "hook missed the item" from "differ missed the edit" (bug 04).

// Resolve a live board item by uuid, or null (shared by the hooks below).
static BOARD_ITEM* testResolve( PCB_EDIT_FRAME* aFrame, const std::string& aId )
{
    if( !aFrame )
        return nullptr;

    return aFrame->GetBoard()->ResolveItem( KIID( wxString::FromUTF8( aId.c_str() ) ),
                                            /*allowNullptr*/ true );
}

// Delete an item by uuid. With a footprint CHILD uuid this is the bug-03
// sending half (the UI's fp-text delete): the emit must lift to a parent
// re-blob; today it goes out as a bare child removal.
bool pcbCollabTestRemoveItem( std::string aId )
{
    PCB_EDIT_FRAME* fr = pcbFrame();
    BOARD_ITEM*     item = testResolve( fr, aId );

    if( !item )
        return false;

    fr->CallAfter( [fr, item]() {
        COROUTINE<int, int> cor( [fr, item]( int ) -> int
                                 {
                                     BOARD_COMMIT commit( fr );
                                     commit.Remove( item );
                                     commit.Push( wxT( "Collab test remove" ) );
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );

    return true;
}

// Rotate an item about its OWN anchor — bug 04: the scalar json carries no
// orientation for footprints, so an anchor-centred rotation is invisible to
// the differ unless a child's absolute position happens to move.
bool pcbCollabTestRotateItem( std::string aId, double aDeg )
{
    PCB_EDIT_FRAME* fr = pcbFrame();
    BOARD_ITEM*     item = testResolve( fr, aId );

    if( !item )
        return false;

    fr->CallAfter( [fr, item, aDeg]() {
        COROUTINE<int, int> cor( [fr, item, aDeg]( int ) -> int
                                 {
                                     BOARD_COMMIT commit( fr );
                                     commit.Modify( item );
                                     item->Rotate( item->GetPosition(),
                                                   EDA_ANGLE( aDeg, DEGREES_T ) );
                                     commit.Push( wxT( "Collab test rotate" ) );
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );

    return true;
}

// Resize a pad (the pad-properties dialog edit) — bug 04: pads are not visited
// by forEachTopItem at all, so the edit never reaches either wire.
bool pcbCollabTestSetPadSize( std::string aId, int aW, int aH )
{
    PCB_EDIT_FRAME* fr = pcbFrame();
    BOARD_ITEM*     item = testResolve( fr, aId );

    if( !item || item->Type() != PCB_PAD_T )
        return false;

    PAD* pad = static_cast<PAD*>( item );

    fr->CallAfter( [fr, pad, aW, aH]() {
        COROUTINE<int, int> cor( [fr, pad, aW, aH]( int ) -> int
                                 {
                                     BOARD_COMMIT commit( fr );
                                     commit.Modify( pad );
                                     pad->SetSize( PADSTACK::ALL_LAYERS, VECTOR2I( aW, aH ) );
                                     commit.Push( wxT( "Collab test pad size" ) );
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );

    return true;
}

// Drag a track/shape END point only — bug 04: Drawings' json is position-only
// and GetPosition() is the START, so an end-point reshape of a graphic shape
// is invisible (tracks DO carry endpoints — the visible control case).
bool pcbCollabTestMoveEndpoint( std::string aId, int aDx, int aDy )
{
    PCB_EDIT_FRAME* fr = pcbFrame();
    BOARD_ITEM*     item = testResolve( fr, aId );

    if( !item || ( !isTrackType( item->Type() ) && item->Type() != PCB_SHAPE_T ) )
        return false;

    fr->CallAfter( [fr, item, aDx, aDy]() {
        COROUTINE<int, int> cor( [fr, item, aDx, aDy]( int ) -> int
                                 {
                                     BOARD_COMMIT commit( fr );
                                     commit.Modify( item );

                                     if( isTrackType( item->Type() ) )
                                     {
                                         auto* t = static_cast<PCB_TRACK*>( item );
                                         t->SetEnd( t->GetEnd() + VECTOR2I( aDx, aDy ) );
                                     }
                                     else
                                     {
                                         auto* s = static_cast<PCB_SHAPE*>( item );
                                         s->SetEnd( s->GetEnd() + VECTOR2I( aDx, aDy ) );
                                     }

                                     commit.Push( wxT( "Collab test endpoint" ) );
                                     return 0;
                                 } );
        cor.Call( 0 );
    } );

    return true;
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

    // Programmatic save of the in-memory board (round-trip tests, README §A).
    function("kicadSaveBoard", &kicadSaveBoard);
    // pcbnew-only test helper (no eeschema counterpart — name is not shared).
    function("kicadCollabTestItemBlob", &kicadCollabTestItemBlob);
    // pcbnew-only ysync-review repro hooks (names not shared with eeschema).
    function("kicadCollabTestSetPadSize", &pcbCollabTestSetPadSize);
    function("kicadCollabTestMoveEndpoint", &pcbCollabTestMoveEndpoint);

#ifndef KICAD_MERGED_EMBIND
    // JS names ALSO registered by eeschema_embind.cpp — in the merged image these are
    // registered once by kicad_editor_embind.cpp, dispatching on the active frame.
    // Programmatic file open (preferred over UI automation from the web app).
    function("kicadOpenFile", &kicadOpenFile);
    // Yjs collaborative bridge entry points (same contract as pl_editor / eeschema).
    function("kicadCollabApply", &pcbCollabApply);
    function("kicadCollabSnapshot", &pcbCollabSnapshot);
    // v2 items bridge: per-item s-expr payloads (ysync 0008).
    function("kicadCollabApplyItems", &pcbCollabApplyItems);
    function("kicadCollabSnapshotItems", &pcbCollabSnapshotItems);
    function("kicadCollabTestMoveFirst", &pcbCollabTestMoveFirst);
    function("kicadCollabGetPos", &pcbCollabGetPos);
    // ysync-review repro hooks shared with eeschema (dispatched when merged).
    function("kicadCollabTestRemoveItem", &pcbCollabTestRemoveItem);
    function("kicadCollabTestRotateItem", &pcbCollabTestRotateItem);
    // Presence (collab-presence 0002) — shared names; eeschema's counterparts land
    // with 0003 (the merged image dispatches pcb-only until then).
    function("kicadCollabPresenceStart", &pcbCollabPresenceStart);
    function("kicadCollabSetRemote", &pcbCollabSetRemote);
    function("kicadCollabSetPins", &pcbCollabSetPins);
    function("kicadCollabSetViewport", &pcbCollabSetViewport);
    function("kicadCollabSetStyle", &pcbCollabSetStyle);
    function("kicadCollabTestListItems", &pcbCollabTestListItems);
    function("kicadCollabTestDemoSet", &pcbCollabTestDemoSet);
    function("kicadCollabGetViewport", &pcbCollabGetViewport);
    function("kicadCollabGetSelection", &pcbCollabGetSelection);
    function("kicadCollabTestSelectFirst", &pcbCollabTestSelectFirst);
    function("kicadCollabTestClearSelection", &pcbCollabTestClearSelection);
#endif // !KICAD_MERGED_EMBIND
}
#endif
