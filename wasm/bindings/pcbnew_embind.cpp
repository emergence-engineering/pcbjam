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
#include <pcb_field.h>
#include <pcb_text.h>
#include <pcb_group.h>
#include <zone.h>
#include <eda_text.h>
#include <pcb_edit_frame.h>
#include <kicad_clipboard.h>
#include <tools/pcb_selection.h>
#include <geometry/shape_poly_set.h>
#include <geometry/shape_line_chain.h>
#include <geometry/eda_angle.h>
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
std::string blobForItem( BOARD* aBoard, BOARD_ITEM* aItem )
{
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
    io.SetReader( [&aBlob]() -> wxString { return wxString::FromUTF8( aBlob.c_str() ); } );

    BOARD_ITEM* parsed = io.Parse();        // FOOTPRINT* (bare) | BOARD* (envelope) | nullptr

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
        tr->SetLayer( (PCB_LAYER_ID) j.value( "layer", (int) F_Cu ) );
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

        zone->SetLayer( (PCB_LAYER_ID) j.value( "layer", (int) F_Cu ) );

        if( outline.size() >= 3 )
            zone->AddPolygon( outline );

        item = zone;
    }
    else if( type == "PCB_TEXT" && j.contains( "text" ) )
    {
        auto* txt = new PCB_TEXT( &aBoard );
        txt->SetText( wxString::FromUTF8( j.value( "text", "" ).c_str() ) );
        txt->SetPosition( VECTOR2I( j.value( "x", 0 ), j.value( "y", 0 ) ) );
        txt->SetLayer( (PCB_LAYER_ID) j.value( "layer", (int) F_SilkS ) );

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

    BOARD*                      board = fr->GetBoard();
    std::map<std::string, json> cur   = snapshotByUuid( *board );

    json added = json::array(), changed = json::array(), removed = json::array();

    for( const auto& [id, j] : cur )
    {
        auto it = g_baseline.find( id );

        if( it == g_baseline.end() )
        {
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
            changed.push_back( j );
        }
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
    function("kicadCollabTestItemBlob", &kicadCollabTestItemBlob);
}
#endif
