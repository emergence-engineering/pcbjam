/*
 * Embind bindings for KiCad pl_editor (drawing-sheet / page-layout editor) WASM.
 *
 * Picked up automatically by scripts/kicad/build-kicad-target.sh when building
 * the pl_editor app (it compiles wasm/bindings/<app>_embind.cpp if present).
 */

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <kiway_player.h>
#include <kiway.h>
#include <vector>
#include <wx/app.h>
#include <wx/string.h>
#include <wx/window.h>
#include <drawing_sheet/ds_data_model.h>

using namespace emscripten;

// Programmatically open a drawing-sheet file (.kicad_wks) in the running editor
// frame, without UI automation. Mirrors single_top.cpp's MacOpenFile path: the
// editor frame is the app's top window and is a KIWAY_PLAYER (PL_EDITOR_FRAME
// overrides OpenProjectFiles). Returns the result of OpenProjectFiles, or false
// if no frame is available — letting the JS caller fall back to driving
// File→Open.
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

// Programmatically save the in-memory drawing sheet to a .kicad_wks file, without
// driving the Save As dialog. pl_editor edits the process-wide singleton
// DS_DATA_MODEL::GetTheInstance(), so this serializes exactly what the editor has
// loaded — letting a test read the file back from MEMFS and assert the (uuid …)
// round-trip / backfill. (Also a building block for the collab bridge's later
// materialize-to-file path.)
void kicadSaveDrawingSheet( std::string path )
{
    DS_DATA_MODEL::GetTheInstance().Save( wxString::FromUTF8( path.c_str() ) );
}

EMSCRIPTEN_BINDINGS(pl_editor) {
    // Programmatic file open (preferred over UI automation from the web app).
    function("kicadOpenFile", &kicadOpenFile);
    function("kicadSaveDrawingSheet", &kicadSaveDrawingSheet);
}
#endif
