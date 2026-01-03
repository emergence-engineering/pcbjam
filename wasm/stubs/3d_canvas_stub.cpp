/*
 * 3D Canvas stubs for KiCad WASM build
 * When KICAD_BUILD_3D_VIEWER_WASM=OFF, these provide stub implementations
 * for 3D canvas and board adapter classes.
 */

#include <3d_canvas/eda_3d_canvas.h>
#include <3d_canvas/board_adapter.h>
#include <3d_viewer/eda_3d_viewer_settings.h>
#include <gal/hidpi_gl_3D_canvas.h>
#include <tool/tool_dispatcher.h>

// EDA_3D_CANVAS stub implementations

EDA_3D_CANVAS::EDA_3D_CANVAS( wxWindow* aParent, const wxGLAttributes& aGLAttribs,
                               BOARD_ADAPTER& aSettings, CAMERA& aCamera,
                               S3D_CACHE* a3DCachePointer ) :
    HIDPI_GL_3D_CANVAS( aParent, aGLAttribs, aCamera, wxID_ANY )
{
    (void)aSettings;
    (void)a3DCachePointer;
    m_3d_render = nullptr;
    m_parentStatusBar = nullptr;
    m_parentInfoBar = nullptr;
    m_eventDispatcher = nullptr;
}

EDA_3D_CANVAS::~EDA_3D_CANVAS()
{
}

void EDA_3D_CANVAS::SetEventDispatcher( TOOL_DISPATCHER* aEventDispatcher )
{
    m_eventDispatcher = aEventDispatcher;
}

void EDA_3D_CANVAS::ReloadRequest( BOARD* aBoard, S3D_CACHE* aCachePointer )
{
    (void)aBoard;
    (void)aCachePointer;
    // No-op: 3D canvas not available in WASM
}

void EDA_3D_CANVAS::OnPaint( wxPaintEvent& aEvent )
{
    (void)aEvent;
    // No-op: 3D canvas not available in WASM
}

void EDA_3D_CANVAS::DoRePaint()
{
    // No-op: 3D canvas not available in WASM
}

void EDA_3D_CANVAS::SetCurrentRender( RENDER_ENGINE aRenderEngine )
{
    (void)aRenderEngine;
    // No-op: 3D canvas not available in WASM
}

void EDA_3D_CANVAS::RenderEngineChanged()
{
    // No-op: 3D canvas not available in WASM
}

void EDA_3D_CANVAS::Request_refresh( bool aRedrawImmediately )
{
    (void)aRedrawImmediately;
    // No-op: 3D canvas not available in WASM
}

void EDA_3D_CANVAS::DisplayStatus()
{
    // No-op: 3D canvas not available in WASM
}

bool EDA_3D_CANVAS::doReRender()
{
    return false;
}


// BOARD_ADAPTER stub implementations

BOARD_ADAPTER::BOARD_ADAPTER() :
    m_board( nullptr ),
    m_3dModelManager( nullptr ),
    m_Cfg( nullptr )
{
}

BOARD_ADAPTER::~BOARD_ADAPTER()
{
}


// EDA_3D_VIEWER_SETTINGS stub implementations

EDA_3D_VIEWER_SETTINGS::EDA_3D_VIEWER_SETTINGS() :
    APP_SETTINGS_BASE( "3d_viewer", 3 )
{
}

EDA_3D_VIEWER_SETTINGS::~EDA_3D_VIEWER_SETTINGS()
{
}


// LAYER_PRESET_3D stub
LAYER_PRESET_3D::LAYER_PRESET_3D( const wxString& aName ) :
    name( aName )
{
}


// PARAM_LAYER_PRESET_3D stub
PARAM_LAYER_PRESET_3D::PARAM_LAYER_PRESET_3D( const std::string& aPath,
                                               std::vector<LAYER_PRESET_3D>* aPresetList ) :
    PARAM_LAMBDA<nlohmann::json>(
        aPath,
        [this]() { return presetsToJson(); },
        [this]( const nlohmann::json& aJson ) { jsonToPresets( aJson ); },
        nlohmann::json::array() ),
    m_presets( aPresetList )
{
}

nlohmann::json PARAM_LAYER_PRESET_3D::presetsToJson()
{
    return nlohmann::json::array();
}

void PARAM_LAYER_PRESET_3D::jsonToPresets( const nlohmann::json& aJson )
{
    (void)aJson;
}
