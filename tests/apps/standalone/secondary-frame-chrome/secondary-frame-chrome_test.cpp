// Isolation harness for the "secondary top-level frame has no usable title bar"
// behaviour seen with KiCad's 3D viewer / footprint editor in the WASM DOM port.
//
// Background: the wx DOM port draws a NON-main top-level window's chrome — a 22px
// title bar with a drag region + an "X" (the canvas-drawn minimize button) — onto
// the window's OWN 2D canvas, gated on HasTitleBar() == !IsMainFrame() (see
// src/wasm/toplevel.cpp). The main frame (wxTopLevelWindows[0]) has no chrome (the
// page is its window). KiCad's 3D viewer is a SECONDARY top-level wxFrame
// (non-main), sized wxDefaultSize -> full screen, carrying a wxGLCanvas that
// createGLCanvas lifts to z-index 2147483647 (above its own chrome). By the code
// such a frame SHOULD have a working title bar; in practice it can't be dragged or
// closed. This app reproduces those conditions in pure wxWidgets so the behaviour
// can be probed in isolation (no KiCad, no Docker).
//
// Buttons open secondary windows in three configs for A/B comparison:
//   - Full GL Frame  : wxDefaultSize (full screen) + wxGLCanvas  (faithful 3D viewer)
//   - Small Frame    : fixed size, no GL                          (chrome-only control)
//   - Modeless Dialog: fixed-size wxDialog                        (known-working chrome)
//
// Pair with the temporary [TLW] logging in src/wasm/toplevel.cpp, which reports
// HasTitleBar / NC paint / title-bar mouse hits per window, and the e2e spec
// tests/e2e/secondary-frame-chrome.spec.ts which drives the drag/close probes.

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/glcanvas.h"
#include "wx/artprov.h"
#include "wx/toolbar.h"

#include <cstdio>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace
{
// Default-attribute wxGLCanvas; the wasm port's ConvertWXAttrsToWebGL fills in
// WebGL2 + preserveDrawingBuffer. No GL drawing needed — createGLCanvas (which
// assigns the z-index) runs at construction, like KiCad's EDA_3D_CANVAS.
wxGLCanvas* MakeGLCanvas( wxWindow* parent )
{
    wxGLAttributes attrs;
    attrs.PlatformDefaults().Defaults().EndList();
    return new wxGLCanvas( parent, attrs, wxID_ANY, wxDefaultPosition, wxDefaultSize );
}

void LogWindow( const char* tag, wxTopLevelWindow* w )
{
    const wxSize sz = w->GetSize();
    printf( "[CHROME-TEST] %s: IsMainFrame=%d size=%dx%d\n",
            tag, (int) w->IsMainFrame(), sz.x, sz.y );
    fflush( stdout );
}
} // namespace

// Faithful 3D-viewer analog: a SECONDARY top-level frame, default-sized (resolved
// to full screen in the wasm port) with a wxGLCanvas filling its client area plus
// a status bar (the 3D viewer has one).
class FullGLFrame : public wxFrame
{
public:
    FullGLFrame()
        : wxFrame( nullptr, wxID_ANY, "Full GL Frame" )
    {
        CreateStatusBar();
        SetStatusText( "secondary GL frame" );

        wxBoxSizer* sizer = new wxBoxSizer( wxVERTICAL );
        sizer->Add( MakeGLCanvas( this ), 1, wxEXPAND );
        SetSizer( sizer );

        LogWindow( "FullGLFrame", this );
    }
};

// Richer 3D-viewer analog: adds the chrome the real EDA_3D_VIEWER_FRAME carries —
// a menu bar, a top toolbar, a left side panel (APPEARANCE_CONTROLS_3D), a status
// bar — on top of a full-size GL canvas. Tests whether any of those DOM elements
// steals the title-bar (NC) region's clicks.
class RichGLFrame : public wxFrame
{
public:
    RichGLFrame()
        : wxFrame( nullptr, wxID_ANY, "Rich GL Frame" )
    {
        wxMenuBar* menuBar = new wxMenuBar();
        wxMenu*    fileMenu = new wxMenu();
        fileMenu->Append( wxID_EXIT, "E&xit" );
        menuBar->Append( fileMenu, "&File" );
        SetMenuBar( menuBar );

        wxToolBar* toolBar = CreateToolBar();
        toolBar->AddTool( wxID_ZOOM_IN, "Zoom", wxArtProvider::GetBitmap( wxART_PLUS ) );
        toolBar->AddTool( wxID_HOME, "Reset", wxArtProvider::GetBitmap( wxART_GO_HOME ) );
        toolBar->Realize();

        CreateStatusBar();
        SetStatusText( "rich secondary GL frame" );

        wxBoxSizer* sizer = new wxBoxSizer( wxHORIZONTAL );
        wxPanel*    side = new wxPanel( this, wxID_ANY, wxDefaultPosition, wxSize( 180, -1 ) );
        new wxStaticText( side, wxID_ANY, "Appearance", wxPoint( 8, 8 ) );
        sizer->Add( side, 0, wxEXPAND );
        sizer->Add( MakeGLCanvas( this ), 1, wxEXPAND );
        SetSizer( sizer );

        LogWindow( "RichGLFrame", this );
    }
};

// Chrome-only control: a fixed-size secondary frame with no GL canvas.
class SmallFrame : public wxFrame
{
public:
    SmallFrame()
        : wxFrame( nullptr, wxID_ANY, "Small Frame", wxPoint( 180, 300 ), wxSize( 360, 280 ) )
    {
        wxPanel* panel = new wxPanel( this );
        new wxStaticText( panel, wxID_ANY, "Small secondary frame (no GL)", wxPoint( 16, 16 ) );

        LogWindow( "SmallFrame", this );
    }
};

// Known-working baseline: a modeless wxDialog (same chrome path as Preferences /
// Print, which the user reports ARE draggable and X-closable).
class BaselineDialog : public wxDialog
{
public:
    explicit BaselineDialog( wxWindow* parent )
        : wxDialog( parent, wxID_ANY, "Modeless Dialog", wxPoint( 560, 300 ), wxSize( 360, 280 ) )
    {
        new wxStaticText( this, wxID_ANY, "Dialog: drag + X should work", wxPoint( 16, 16 ) );

        LogWindow( "BaselineDialog", this );
    }
};

class MainFrame : public wxFrame
{
public:
    MainFrame()
        : wxFrame( nullptr, wxID_ANY, "Main Frame", wxDefaultPosition, wxSize( 800, 600 ) )
    {
        wxPanel*    panel = new wxPanel( this );
        wxBoxSizer* sizer = new wxBoxSizer( wxVERTICAL );

        auto addButton =
                [&]( const wxString& label, void ( MainFrame::*handler )( wxCommandEvent& ) )
                {
                    wxButton* button = new wxButton( panel, wxID_ANY, label );
                    button->Bind( wxEVT_BUTTON, handler, this );
                    sizer->Add( button, 0, wxALL, 8 );
                };

        addButton( "Open Full GL Frame", &MainFrame::OnFullGL );
        addButton( "Open Rich GL Frame", &MainFrame::OnRichGL );
        addButton( "Open Small Frame", &MainFrame::OnSmall );
        addButton( "Open Modeless Dialog", &MainFrame::OnDialog );

        // A GL canvas in the MAIN frame too, so a secondary GL canvas is created
        // "while another GL canvas is already visible" — the condition that lifts
        // it to z-index 2147483647 over the chrome (mirrors pcbnew's GAL canvas).
        sizer->Add( MakeGLCanvas( panel ), 1, wxEXPAND );
        panel->SetSizer( sizer );

        LogWindow( "MainFrame", this );
    }

private:
    void OnFullGL( wxCommandEvent& WXUNUSED( evt ) ) { ( new FullGLFrame() )->Show( true ); }
    void OnRichGL( wxCommandEvent& WXUNUSED( evt ) ) { ( new RichGLFrame() )->Show( true ); }
    void OnSmall( wxCommandEvent& WXUNUSED( evt ) ) { ( new SmallFrame() )->Show( true ); }
    void OnDialog( wxCommandEvent& WXUNUSED( evt ) ) { ( new BaselineDialog( this ) )->Show( true ); }
};

class SecondaryFrameChromeApp : public wxApp
{
public:
    bool OnInit() override
    {
        if( !wxApp::OnInit() )
            return false;

#ifdef __EMSCRIPTEN__
        // The bare test shell (template.html) lays out #window-container BELOW the
        // full-size main #canvas in normal flow, so secondary windows render off
        // the bottom of the page (and body overflow is hidden, so you can't scroll
        // to them). The real standalone app overlays it. Overlay it here so the
        // opened frames are visible for MANUAL interaction. The window divs are
        // pointer-events:none and this container is 0x0, so it does not block
        // clicks to the main canvas or steal events. (Does not affect the
        // Playwright probe, which uses wx-screen coords via #canvas.)
        EM_ASM( {
            var wc = document.getElementById( 'window-container' );
            if( wc )
            {
                wc.style.position = 'absolute';
                wc.style.top = '0px';
                wc.style.left = '0px';
            }
        } );
#endif

        ( new MainFrame() )->Show( true );
        return true;
    }
};

wxIMPLEMENT_APP( SecondaryFrameChromeApp );
