/*
 * Embind dispatcher for the merged kicad_editor WASM image (editor-unification Part 2).
 *
 * The pcbnew and eeschema binding TUs each implement the collab bridge for their own
 * frame and, standalone, register the SAME JS-facing names. In the merged image both
 * TUs are compiled with -DKICAD_MERGED_EMBIND, which
 *   - compiles out their duplicate frame-agnostic definitions (kicadOpenFile,
 *     extern "C" kicadCollabOnSave) — the single definitions live HERE, and
 *   - compiles out their shared-name EMSCRIPTEN_BINDINGS registrations — registered
 *     once HERE, dispatching to the renamed per-editor entries (pcbCollab… and
 *     schCollab…) on whichever editor frame is live. Per-editor unique names
 *     (kicadSaveBoard, kicadSaveSchematic, kicadCollabTestItemBlob, Board_…) keep
 *     flowing from the per-editor blocks unchanged.
 *
 * With the one-frame-per-page-load model exactly one of pcbEditorActive() /
 * schEditorActive() is true — the same dynamic_cast probe every per-editor entry
 * already starts with. JS-facing names and signatures are IDENTICAL to the standalone
 * bundles, so the web app and tests need no per-bundle API differences.
 *
 * Deliberately header-light: no pcbnew/eeschema headers (avoids mixing both include
 * roots in one TU); only the generic KIWAY_PLAYER surface + the extern declarations.
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <emscripten/bind.h>
#include <algorithm>
#include <string>
#include <vector>
#include <wx/app.h>
#include <wx/string.h>
#include <wx/window.h>
#include <wx/frame.h>
#include <wx/menu.h>
#include <wx/statusbr.h>
#include <wx/aui/framemanager.h>
#include <kiway.h>
#include <kiway_player.h>

using namespace emscripten;

// Per-editor entry points and frame probes — defined (with external linkage) in
// pcbnew_embind.cpp / eeschema_embind.cpp.
bool        pcbEditorActive();
void        pcbCollabApply( std::string aJson );
void        pcbCollabApplyItems( std::string aJson );
std::string pcbCollabSnapshot();
std::string pcbCollabSnapshotItems();
std::string pcbCollabTestMoveFirst( int aDx, int aDy );
std::string pcbCollabGetPos( std::string aId );
bool        pcbCollabTestRemoveItem( std::string aId );
bool        pcbCollabTestRotateItem( std::string aId, double aDeg );
// Collab-aware undo (ysync miss 09).
bool        pcbCollabTestUndo();
int         pcbCollabTestUndoDepth();
// Presence (collab-presence 0002) + comment pins/panning (0005).
void        pcbCollabPresenceStart();
void        pcbCollabSetRemote( std::string aJson );
void        pcbCollabSetPins( std::string aJson );
void        pcbCollabSetViewport( double aCx, double aCy );
void        pcbCollabSetStyle( std::string aJson );
std::string pcbCollabTestListItems( int aCount );
std::string pcbCollabTestDemoSet();
std::string pcbCollabGetViewport();
std::string pcbCollabGetSelection();
// Cross-app selection (collab-presence 0006).
std::string pcbCollabGetSelectionFull();
std::string pcbCollabTestGetCrossMapped();
std::string pcbCollabTestSelectComponent();
// Selection soft-locks (collab-presence 0007).
void        pcbCollabReleaseSelection( std::string aUuidsJson, std::string aHolder );
std::string pcbCollabTestGetLocked();
std::string pcbCollabTestSelectFirst();
bool        pcbCollabTestClearSelection();

bool        schEditorActive();
void        schCollabApply( std::string aJson );
void        schCollabApplyItems( std::string aJson );
std::string schCollabSnapshot();
std::string schCollabSnapshotItems();
std::string schCollabTestMoveFirst( int aDx, int aDy );
std::string schCollabGetPos( std::string aId );
bool        schCollabTestRemoveItem( std::string aId );
bool        schCollabTestRotateItem( std::string aId, double aDeg );
// Collab-aware undo (ysync miss 09).
bool        schCollabTestUndo();
int         schCollabTestUndoDepth();
// Presence (collab-presence 0003 — eeschema counterparts) + pins (0005).
void        schCollabPresenceStart();
void        schCollabSetRemote( std::string aJson );
void        schCollabSetPins( std::string aJson );
void        schCollabSetViewport( double aCx, double aCy );
void        schCollabSetStyle( std::string aJson );
std::string schCollabTestListItems( int aCount );
std::string schCollabTestDemoSet();
std::string schCollabGetViewport();
std::string schCollabGetSelection();
// Cross-app selection (collab-presence 0006).
std::string schCollabGetSelectionFull();
std::string schCollabTestGetCrossMapped();
std::string schCollabTestSelectComponent();
// Selection soft-locks (collab-presence 0007).
void        schCollabReleaseSelection( std::string aUuidsJson, std::string aHolder );
std::string schCollabTestGetLocked();
std::string schCollabTestSelectFirst();
bool        schCollabTestClearSelection();


// Programmatically open a project file in the running editor frame, without UI
// automation. Frame-agnostic (any KIWAY_PLAYER); byte-identical to the definition the
// standalone bundles compile from their own binding TU.
static bool kicadOpenFile( std::string path )
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


// Canvas-only chrome toggle (features/mobile): hide/show every AUI pane
// except the central draw canvas, plus the menubar and status bar, so the GAL
// canvas fills the frame. Generic wxFrame/wxAui surface only (keeps this TU
// header-light and serves both editor frames). Hidden bars release their space
// because the wasm port's frame client-area math skips !IsShown() bars (native
// parity, see wxwidgets/src/wasm/frame.cpp). Returns false until the editor
// frame exists — main() builds it after runtime init — so JS polls this.

// Hide-time visibility snapshot. KiCad keeps several panes hidden by default
// (Search, Properties, Net Inspector, …), so a blanket Show(true) on restore
// would surface panes the user never had open — restore only what the hide
// actually took away. Keyed to the frame so a snapshot never leaks onto a
// different frame's wxAuiManager.
static struct
{
    wxFrame*              frame = nullptr;
    bool                  valid = false;
    bool                  menuShown = false;
    bool                  statusShown = false;
    std::vector<wxString> paneNames;
} s_chromeSnap;

static bool chromeSkipsPane( const wxAuiPaneInfo& aPane )
{
    // keep the central editor canvas (named "DrawFrame" in both editors)
    return aPane.dock_direction == wxAUI_DOCK_CENTER || aPane.name == wxT( "DrawFrame" );
}

static bool kicadSetChrome( bool aShow )
{
    wxFrame* frame =
            wxTheApp ? dynamic_cast<wxFrame*>( wxTheApp->GetTopWindow() ) : nullptr;

    if( !frame )
        return false;

    wxMenuBar*    menuBar = frame->GetMenuBar();
    wxStatusBar*  statusBar = frame->GetStatusBar();
    wxAuiManager* mgr = wxAuiManager::GetManager( frame );

    if( !aShow )
    {
        // A repeated hide keeps the original snapshot (idempotent).
        if( !s_chromeSnap.valid || s_chromeSnap.frame != frame )
        {
            s_chromeSnap.frame = frame;
            s_chromeSnap.menuShown = menuBar && menuBar->IsShown();
            s_chromeSnap.statusShown = statusBar && statusBar->IsShown();
            s_chromeSnap.paneNames.clear();

            if( mgr )
            {
                wxAuiPaneInfoArray& panes = mgr->GetAllPanes();

                for( size_t i = 0; i < panes.GetCount(); ++i )
                {
                    wxAuiPaneInfo& pane = panes.Item( i );

                    if( !chromeSkipsPane( pane ) && pane.IsShown() )
                        s_chromeSnap.paneNames.push_back( pane.name );
                }
            }

            s_chromeSnap.valid = true;
        }
    }

    // A show with no snapshot (or one taken on a different frame) falls back
    // to revealing the standard chrome instead of obeying stale state.
    const bool haveSnap = s_chromeSnap.valid && s_chromeSnap.frame == frame;

    if( menuBar )
        menuBar->Show( aShow && ( haveSnap ? s_chromeSnap.menuShown : true ) );

    // Kept alive rather than detached: KiCad SetStatusText()s on every cursor
    // move, and wxFrameBase wxCHECKs a null status bar.
    if( statusBar )
        statusBar->Show( aShow && ( haveSnap ? s_chromeSnap.statusShown : true ) );

    if( mgr )
    {
        wxAuiPaneInfoArray& panes = mgr->GetAllPanes();

        for( size_t i = 0; i < panes.GetCount(); ++i )
        {
            wxAuiPaneInfo& pane = panes.Item( i );

            if( chromeSkipsPane( pane ) )
                continue;

            if( !aShow )
            {
                pane.Show( false );
            }
            else if( haveSnap )
            {
                if( std::find( s_chromeSnap.paneNames.begin(), s_chromeSnap.paneNames.end(),
                               pane.name )
                    != s_chromeSnap.paneNames.end() )
                {
                    pane.Show( true );
                }
            }
            else if( pane.IsToolbar() )
            {
                // Show with no (or a stale, other-frame) snapshot: reveal the
                // toolbars only — blanket-showing plain panels would surface
                // the default-hidden ones.
                pane.Show( true );
            }
        }

        mgr->Update();
    }

    if( aShow )
        s_chromeSnap.valid = false;

    frame->SendSizeEvent();
    return true;
}


// C++ → JS save notification. Called from BOTH fork save chokepoints
// (PCB_EDIT_FRAME::SavePcbFile and SCH_EDIT_FRAME::saveSchematicFile) — one shared
// definition serves the merged image. No-op without a JS listener.
extern "C" void kicadCollabOnSave( const char* aPath )
{
    EM_ASM( {
        if( window.kicadCollab && window.kicadCollab.onSave )
            window.kicadCollab.onSave( UTF8ToString( $0 ) );
    }, aPath );
}


// Dispatch shims: route each shared JS name to the live editor's implementation.
// The sch path is the fallback arm so a JS call with NO frame up behaves like the
// standalone bundles (the per-editor impls no-op / return empty on a null frame).
static void collabApply( std::string aJson )
{
    pcbEditorActive() ? pcbCollabApply( aJson ) : schCollabApply( aJson );
}

static void collabApplyItems( std::string aJson )
{
    pcbEditorActive() ? pcbCollabApplyItems( aJson ) : schCollabApplyItems( aJson );
}

static std::string collabSnapshot()
{
    return pcbEditorActive() ? pcbCollabSnapshot() : schCollabSnapshot();
}

static std::string collabSnapshotItems()
{
    return pcbEditorActive() ? pcbCollabSnapshotItems() : schCollabSnapshotItems();
}

static std::string collabTestMoveFirst( int aDx, int aDy )
{
    return pcbEditorActive() ? pcbCollabTestMoveFirst( aDx, aDy )
                             : schCollabTestMoveFirst( aDx, aDy );
}

static std::string collabGetPos( std::string aId )
{
    return pcbEditorActive() ? pcbCollabGetPos( aId ) : schCollabGetPos( aId );
}

static bool collabTestRemoveItem( std::string aId )
{
    return pcbEditorActive() ? pcbCollabTestRemoveItem( aId ) : schCollabTestRemoveItem( aId );
}

static bool collabTestRotateItem( std::string aId, double aDeg )
{
    return pcbEditorActive() ? pcbCollabTestRotateItem( aId, aDeg )
                             : schCollabTestRotateItem( aId, aDeg );
}

static bool collabTestUndo()
{
    return pcbEditorActive() ? pcbCollabTestUndo() : schCollabTestUndo();
}

static int collabTestUndoDepth()
{
    return pcbEditorActive() ? pcbCollabTestUndoDepth() : schCollabTestUndoDepth();
}

// Presence shims (collab-presence 0002 pcbnew / 0003 eeschema): route to the live
// editor's implementation, same pattern as the collab bridge shims above.
static void collabPresenceStart()
{
    pcbEditorActive() ? pcbCollabPresenceStart() : schCollabPresenceStart();
}

static void collabSetRemote( std::string aJson )
{
    pcbEditorActive() ? pcbCollabSetRemote( aJson ) : schCollabSetRemote( aJson );
}

static void collabSetPins( std::string aJson )
{
    pcbEditorActive() ? pcbCollabSetPins( aJson ) : schCollabSetPins( aJson );
}

static void collabSetViewport( double aCx, double aCy )
{
    pcbEditorActive() ? pcbCollabSetViewport( aCx, aCy ) : schCollabSetViewport( aCx, aCy );
}

static void collabSetStyle( std::string aJson )
{
    pcbEditorActive() ? pcbCollabSetStyle( aJson ) : schCollabSetStyle( aJson );
}

static std::string collabTestListItems( int aCount )
{
    return pcbEditorActive() ? pcbCollabTestListItems( aCount ) : schCollabTestListItems( aCount );
}

static std::string collabTestDemoSet()
{
    return pcbEditorActive() ? pcbCollabTestDemoSet() : schCollabTestDemoSet();
}

static std::string collabGetViewport()
{
    return pcbEditorActive() ? pcbCollabGetViewport() : schCollabGetViewport();
}

static std::string collabGetSelection()
{
    return pcbEditorActive() ? pcbCollabGetSelection() : schCollabGetSelection();
}

static std::string collabGetSelectionFull()
{
    return pcbEditorActive() ? pcbCollabGetSelectionFull() : schCollabGetSelectionFull();
}

static std::string collabTestGetCrossMapped()
{
    return pcbEditorActive() ? pcbCollabTestGetCrossMapped() : schCollabTestGetCrossMapped();
}

static std::string collabTestSelectComponent()
{
    return pcbEditorActive() ? pcbCollabTestSelectComponent() : schCollabTestSelectComponent();
}

static void collabReleaseSelection( std::string aUuidsJson, std::string aHolder )
{
    pcbEditorActive() ? pcbCollabReleaseSelection( aUuidsJson, aHolder )
                      : schCollabReleaseSelection( aUuidsJson, aHolder );
}

static std::string collabTestGetLocked()
{
    return pcbEditorActive() ? pcbCollabTestGetLocked() : schCollabTestGetLocked();
}

static std::string collabTestSelectFirst()
{
    return pcbEditorActive() ? pcbCollabTestSelectFirst() : schCollabTestSelectFirst();
}

static bool collabTestClearSelection()
{
    return pcbEditorActive() ? pcbCollabTestClearSelection() : schCollabTestClearSelection();
}


EMSCRIPTEN_BINDINGS(kicad_editor) {
    // Programmatic file open (preferred over UI automation from the web app).
    function("kicadOpenFile", &kicadOpenFile);

    // Canvas-only mobile mode (features/mobile).
    function("kicadSetChrome", &kicadSetChrome);

    // Yjs collaborative bridge entry points — same JS contract as the standalone
    // bundles, dispatched on the active editor frame.
    function("kicadCollabApply", &collabApply);
    function("kicadCollabSnapshot", &collabSnapshot);
    function("kicadCollabApplyItems", &collabApplyItems);
    function("kicadCollabSnapshotItems", &collabSnapshotItems);
    function("kicadCollabTestMoveFirst", &collabTestMoveFirst);
    function("kicadCollabGetPos", &collabGetPos);
    // ysync-review repro hooks (shared names; per-editor-only hooks — pad size,
    // endpoint, field text — flow from the per-editor blocks unchanged).
    function("kicadCollabTestRemoveItem", &collabTestRemoveItem);
    function("kicadCollabTestRotateItem", &collabTestRotateItem);
    // Collab-aware undo (ysync miss 09).
    function("kicadCollabTestUndo", &collabTestUndo);
    function("kicadCollabTestUndoDepth", &collabTestUndoDepth);
    // Presence (collab-presence 0002/0003) + comment pins/panning (0005).
    function("kicadCollabPresenceStart", &collabPresenceStart);
    function("kicadCollabSetRemote", &collabSetRemote);
    function("kicadCollabSetPins", &collabSetPins);
    function("kicadCollabSetViewport", &collabSetViewport);
    function("kicadCollabSetStyle", &collabSetStyle);
    function("kicadCollabTestListItems", &collabTestListItems);
    function("kicadCollabTestDemoSet", &collabTestDemoSet);
    function("kicadCollabGetViewport", &collabGetViewport);
    function("kicadCollabGetSelection", &collabGetSelection);
    // Cross-app selection (collab-presence 0006).
    function("kicadCollabGetSelectionFull", &collabGetSelectionFull);
    function("kicadCollabTestGetCrossMapped", &collabTestGetCrossMapped);
    function("kicadCollabTestSelectComponent", &collabTestSelectComponent);
    // Selection soft-locks (collab-presence 0007).
    function("kicadCollabReleaseSelection", &collabReleaseSelection);
    function("kicadCollabTestGetLocked", &collabTestGetLocked);
    function("kicadCollabTestSelectFirst", &collabTestSelectFirst);
    function("kicadCollabTestClearSelection", &collabTestClearSelection);
}

#endif // __EMSCRIPTEN__
