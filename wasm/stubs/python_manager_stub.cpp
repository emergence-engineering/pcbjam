/*
 * Python Manager stubs for KiCad WASM build
 * Python scripting is not available in WASM
 */

#include <python_manager.h>

// Implementation

PYTHON_MANAGER::PYTHON_MANAGER( const wxString& aInterpreterPath ) :
    m_interpreterPath( aInterpreterPath )
{
}

long PYTHON_MANAGER::Execute( const std::vector<wxString>& aArgs,
                              const std::function<void(int, const wxString&, const wxString&)>& aCallback,
                              const wxExecuteEnv* aEnv,
                              bool aSaveOutput )
{
    (void)aArgs;
    (void)aCallback;
    (void)aEnv;
    (void)aSaveOutput;
    // Return 0: no process created (Python not available in WASM)
    return 0;
}

wxString PYTHON_MANAGER::FindPythonInterpreter()
{
    return wxEmptyString;
}

std::optional<wxString> PYTHON_MANAGER::GetPythonEnvironment( const wxString& aNamespace )
{
    (void)aNamespace;
    return std::nullopt;
}

std::optional<wxString> PYTHON_MANAGER::GetVirtualPython( const wxString& aNamespace )
{
    (void)aNamespace;
    return std::nullopt;
}
