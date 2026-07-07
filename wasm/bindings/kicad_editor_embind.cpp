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
#include <string>
#include <vector>
#include <wx/app.h>
#include <wx/string.h>
#include <wx/window.h>
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
    function("kicadCollabTestSelectFirst", &collabTestSelectFirst);
    function("kicadCollabTestClearSelection", &collabTestClearSelection);
}

#endif // __EMSCRIPTEN__
