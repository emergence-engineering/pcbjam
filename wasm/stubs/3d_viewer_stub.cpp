/*
 * 3D Viewer stubs for KiCad WASM build
 * When KICAD_BUILD_3D_VIEWER_WASM=OFF, the 3D viewer library is not linked.
 * These stubs provide implementations for symbols that pcbnew references.
 */

#include <3d_viewer/eda_3d_viewer_frame.h>
#include <3d_viewer/eda_3d_viewer_settings.h>
#include <3d_viewer/toolbars_3d.h>

// EDA_3D_VIEWER_FRAME stub implementations
// The 3D viewer is not available in WASM builds

EDA_3D_VIEWER_FRAME::EDA_3D_VIEWER_FRAME( KIWAY* aKiway, PCB_BASE_FRAME* aParent,
                                           const wxString& aTitle, long style ) :
    KIWAY_PLAYER( aKiway, aParent, FRAME_PCB_DISPLAY3D, aTitle, wxDefaultPosition,
                  wxDefaultSize, style, wxT( "3D Viewer" ) ),
    m_currentCamera( m_trackBallCamera ),
    m_trackBallCamera( 2 * RANGE_SCALE_3D )
{
    m_canvas = nullptr;
    m_disable_ray_tracing = true;
    m_appearancePanel = nullptr;

    // 3D Viewer is not supported in WASM - close immediately
    wxLogWarning( "3D Viewer is not available in this build" );
}

EDA_3D_VIEWER_FRAME::~EDA_3D_VIEWER_FRAME()
{
}

void EDA_3D_VIEWER_FRAME::ReloadRequest()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::NewDisplay( bool aForceImmediateRedraw )
{
    (void)aForceImmediateRedraw;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::Redraw()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::SaveSettings( APP_SETTINGS_BASE* aCfg )
{
    (void)aCfg;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::LoadSettings( APP_SETTINGS_BASE* aCfg )
{
    (void)aCfg;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::CommonSettingsChanged( int aFlags )
{
    (void)aFlags;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::ShowChangedLanguage()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::ToggleAppearanceManager()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::OnDarkModeToggle()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::TakeScreenshot( EDA_3D_VIEWER_EXPORT_FORMAT aFormat )
{
    (void)aFormat;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::ExportImage( EDA_3D_VIEWER_EXPORT_FORMAT aFormat, const wxSize& aSize )
{
    (void)aFormat;
    (void)aSize;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::setupUIConditions()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::handleIconizeEvent( wxIconizeEvent& aEvent )
{
    (void)aEvent;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::Exit3DFrame( wxCommandEvent& event )
{
    (void)event;
    Close( true );
}

void EDA_3D_VIEWER_FRAME::OnCloseWindow( wxCloseEvent& event )
{
    (void)event;
    Destroy();
}

bool EDA_3D_VIEWER_FRAME::TryBefore( wxEvent& aEvent )
{
    return wxFrame::TryBefore( aEvent );
}

void EDA_3D_VIEWER_FRAME::Process_Special_Functions( wxCommandEvent& event )
{
    (void)event;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::onDisableRayTracing( wxCommandEvent& aEvent )
{
    (void)aEvent;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::OnActivate( wxActivateEvent& event )
{
    (void)event;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::OnSetFocus( wxFocusEvent& event )
{
    (void)event;
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::doReCreateMenuBar()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::RenderEngineChanged()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::refreshRender()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::loadCommonSettings()
{
    // No-op: 3D viewer not available
}

void EDA_3D_VIEWER_FRAME::applySettings( EDA_3D_VIEWER_SETTINGS* aSettings )
{
    (void)aSettings;
    // No-op: 3D viewer not available
}

bool EDA_3D_VIEWER_FRAME::getExportFileName( EDA_3D_VIEWER_EXPORT_FORMAT& aFormat, wxString& fullFileName )
{
    (void)aFormat;
    (void)fullFileName;
    return false;
}

wxImage EDA_3D_VIEWER_FRAME::captureScreenshot( const wxSize& aSize )
{
    (void)aSize;
    return wxImage();
}

void EDA_3D_VIEWER_FRAME::setupRenderingConfig( BOARD_ADAPTER& adapter )
{
    (void)adapter;
}

wxImage EDA_3D_VIEWER_FRAME::captureCurrentViewScreenshot()
{
    return wxImage();
}

wxImage EDA_3D_VIEWER_FRAME::captureRaytracingScreenshot( BOARD_ADAPTER& adapter, TRACK_BALL& camera, const wxSize& aSize )
{
    (void)adapter;
    (void)camera;
    (void)aSize;
    return wxImage();
}

wxImage EDA_3D_VIEWER_FRAME::convertRGBAToImage( uint8_t* rgbaBuffer, const wxSize& realSize )
{
    (void)rgbaBuffer;
    (void)realSize;
    return wxImage();
}

wxImage EDA_3D_VIEWER_FRAME::captureOpenGLScreenshot( BOARD_ADAPTER& adapter, TRACK_BALL& camera, const wxSize& aSize )
{
    (void)adapter;
    (void)camera;
    (void)aSize;
    return wxImage();
}

void EDA_3D_VIEWER_FRAME::configureCanvas( std::unique_ptr<EDA_3D_CANVAS>& canvas, EDA_3D_VIEWER_SETTINGS* cfg )
{
    (void)canvas;
    (void)cfg;
}

void EDA_3D_VIEWER_FRAME::saveOrCopyImage( const wxImage& screenshotImage, EDA_3D_VIEWER_EXPORT_FORMAT aFormat, const wxString& fullFileName )
{
    (void)screenshotImage;
    (void)aFormat;
    (void)fullFileName;
}

void EDA_3D_VIEWER_FRAME::copyImageToClipboard( const wxImage& screenshotImage )
{
    (void)screenshotImage;
}

void EDA_3D_VIEWER_FRAME::saveImageToFile( const wxImage& screenshotImage, EDA_3D_VIEWER_EXPORT_FORMAT aFormat, const wxString& fullFileName )
{
    (void)screenshotImage;
    (void)aFormat;
    (void)fullFileName;
}

// Static member
const wxChar* EDA_3D_VIEWER_FRAME::m_logTrace = wxT( "KI_TRACE_EDA_3D_VIEWER" );

// Event table (empty - no events to handle)
wxBEGIN_EVENT_TABLE( EDA_3D_VIEWER_FRAME, KIWAY_PLAYER )
wxEND_EVENT_TABLE()


// EDA_3D_VIEWER_TOOLBAR_SETTINGS stub
std::optional<TOOLBAR_CONFIGURATION> EDA_3D_VIEWER_TOOLBAR_SETTINGS::DefaultToolbarConfig( TOOLBAR_LOC aToolbar )
{
    (void)aToolbar;
    return std::nullopt;
}
