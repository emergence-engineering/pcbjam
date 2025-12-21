/* PCBnew scripting stubs for WebAssembly builds
 * Python scripting is disabled in WASM, these stubs prevent link errors.
 */

#include <wx/string.h>

void pcbnewGetScriptsSearchPaths( wxString& aNames )
{
    aNames = wxT("(Scripting disabled in WASM build)");
}

void pcbnewGetUnloadableScriptNames( wxString& aNames )
{
    aNames = wxEmptyString;
}

void pcbnewGetWizardsBackTrace( wxString& aTrace )
{
    aTrace = wxEmptyString;
}
