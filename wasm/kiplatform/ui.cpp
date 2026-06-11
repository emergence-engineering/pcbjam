/*
 * WASM implementation of kiplatform/ui.h
 * Provides UI functions for browser environment
 */

#include <kiplatform/ui.h>
#include <wx/window.h>
#include <wx/choice.h>
#include <wx/toplevel.h>
#include <wx/nonownedwnd.h>
#include <wx/colour.h>
#include <wx/settings.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace KIPLATFORM
{
namespace UI
{

bool IsDarkTheme()
{
    // The wasm/wxUniversal UI renders a fixed theme that does not follow the
    // browser's prefers-color-scheme; report the theme actually rendered so
    // icon variants and widget colours stay consistent with the widget chrome.
    return wxSystemSettings::GetColour( wxSYS_COLOUR_WINDOW ).GetLuminance() < 0.5;
}

wxColour GetDialogBGColour()
{
    return wxSystemSettings::GetColour( wxSYS_COLOUR_BTNFACE );
}

void ForceFocus( wxWindow* aWindow )
{
    if( aWindow )
        aWindow->SetFocus();
}

bool IsWindowActive( wxWindow* aWindow )
{
    if( !aWindow )
        return false;

    wxTopLevelWindow* tlw = dynamic_cast<wxTopLevelWindow*>( aWindow );
    if( tlw )
        return tlw->IsActive();

    // For non-TLW, check if it has focus
    return aWindow->HasFocus();
}

void ReparentModal( wxNonOwnedWindow* aWindow )
{
    // No-op in browser - modal handling is different
}

void ReparentWindow( wxNonOwnedWindow* aWindow, wxTopLevelWindow* aParent )
{
    // Reparenting not typically needed in browser
}

void FixupCancelButtonCmdKeyCollision( wxWindow* aWindow )
{
    // Not needed in browser - no Cmd key
}

bool IsStockCursorOk( wxStockCursor aCursor )
{
    // All stock cursors should work in browser via CSS
    return true;
}

void LargeChoiceBoxHack( wxChoice* aChoice )
{
    // Not needed in browser
}

void EllipsizeChoiceBox( wxChoice* aChoice )
{
    // Browser handles text overflow via CSS
}

double GetPixelScaleFactor( const wxWindow* aWindow )
{
    // Return actual device pixel ratio for hi-res bitmap loading and bundle
    // selection. KiCad keeps its own logical content scale at 1.0 in WASM, so
    // bitmap selection must stay decoupled from layout sizing.
#ifdef __EMSCRIPTEN__
    double scale = aWindow ? aWindow->GetDPIScaleFactor() : EM_ASM_DOUBLE({
        return window.devicePixelRatio || 1.0;
    });
    return scale >= 1.5 ? 2.0 : 1.0;
#else
    if( aWindow )
        return aWindow->GetContentScaleFactor();
    return 1.0;
#endif
}

double GetContentScaleFactor( const wxWindow* aWindow )
{
    // KiCad layout uses logical coordinates in WASM. wxWidgets window/content
    // scaling still reports the display scale separately for DIP conversions.
    return aWindow ? aWindow->GetContentScaleFactor() : 1.0;
}

void GetInfoBarColours( wxColour& aFGColour, wxColour& aBGColour )
{
    // Use standard info bar colors
    if( IsDarkTheme() )
    {
        aFGColour = wxColour( 255, 255, 255 );
        aBGColour = wxColour( 50, 50, 120 );  // Dark blue
    }
    else
    {
        aFGColour = wxColour( 0, 0, 0 );
        aBGColour = wxColour( 200, 220, 255 );  // Light blue
    }
}

wxSize GetUnobscuredSize( const wxWindow* aWindow )
{
    if( aWindow )
        return aWindow->GetClientSize();
    return wxSize( 0, 0 );
}

void SetOverlayScrolling( const wxWindow* aWindow, bool overlay )
{
    // Browser handles scrollbar styling via CSS
}

bool AllowIconsInMenus()
{
    // Icons in menus are fine in browser
    return true;
}

wxPoint GetMousePosition()
{
    return wxGetMousePosition();
}

bool WarpPointer( wxWindow* aWindow, int aX, int aY )
{
    // Pointer warping is restricted in browsers for security
    // We can still call WarpPointer but it may not work
    if( aWindow )
    {
        aWindow->WarpPointer( aX, aY );
        return true;
    }
    return false;
}

void ImmControl( wxWindow* aWindow, bool aEnable )
{
    // IME control not needed in browser - handled natively
}

void ImeNotifyCancelComposition( wxWindow* aWindow )
{
    // IME control not needed in browser
}

bool InfiniteDragPrepareWindow( wxWindow* aWindow )
{
    // Pointer lock API could be used for infinite drag
    // but requires user gesture and permission
    return false;
}

void InfiniteDragReleaseWindow()
{
    // No-op
}

void EnsureVisible( wxWindow* aWindow )
{
    // In browser, window is always visible (single page)
    if( aWindow )
        aWindow->Raise();
}

void SetFloatLevel( wxWindow* aWindow )
{
    // No floating window levels in browser
}

} // namespace UI
} // namespace KIPLATFORM
