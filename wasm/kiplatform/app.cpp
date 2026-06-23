/*
 * WASM implementation of kiplatform/app.h
 * Provides application lifecycle functions for browser environment
 */

#include <kiplatform/app.h>
#include <wx/string.h>
#include <wx/window.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace KIPLATFORM
{
namespace APP
{

bool Init()
{
    // WASM initialization - nothing special needed
    return true;
}

bool AttachConsole( bool aTryAlloc )
{
    // Console is always available via browser dev tools
    return true;
}

bool IsOperatingSystemUnsupported()
{
    // WASM/browser is supported
    return false;
}

bool RegisterApplicationRestart( const wxString& aCommandLine )
{
    // No restart registration in browser
    return false;
}

bool UnregisterApplicationRestart()
{
    // No restart registration in browser
    return true;
}

bool SupportsShutdownBlockReason()
{
    // Browser handles page unload via beforeunload event
    return false;
}

void SetShutdownBlockReason( wxWindow* aWindow, const wxString& aReason )
{
    // Could implement via beforeunload event if needed
#ifdef __EMSCRIPTEN__
    EM_ASM({
        window.onbeforeunload = function() {
            return UTF8ToString($0);
        };
    }, aReason.utf8_str().data());
#endif
}

void RemoveShutdownBlockReason( wxWindow* aWindow )
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        window.onbeforeunload = null;
    });
#endif
}

void ForceTimerMessagesToBeCreatedIfNecessary()
{
    // Not needed in browser - timers work differently
}

void AddDynamicLibrarySearchPath( const wxString& aPath )
{
    // No dynamic library loading in WASM
}

void EnableDarkMode( bool aForce )
{
    // Native platforms use this to theme window chrome (title bars, etc.).
    // In the browser the page/host controls theming via CSS, so this is a no-op.
    (void) aForce;
}

} // namespace APP
} // namespace KIPLATFORM
