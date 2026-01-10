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
#include <view/view_controls.h>
#include <dialogs/panel_preview_3d_model.h>
#include <dialogs/dialog_select_3d_model.h>
#include <3d_rendering/track_ball.h>
#include <common_ogl/ogl_attr_list.h>

// EDA_3D_CANVAS event table stub
BEGIN_EVENT_TABLE( EDA_3D_CANVAS, HIDPI_GL_3D_CANVAS )
END_EVENT_TABLE()

// EDA_3D_CANVAS stub implementations

EDA_3D_CANVAS::EDA_3D_CANVAS( wxWindow* aParent, const wxGLAttributes& aGLAttribs,
                               BOARD_ADAPTER& aSettings, CAMERA& aCamera,
                               S3D_CACHE* a3DCachePointer ) :
    HIDPI_GL_3D_CANVAS( KIGFX::VC_SETTINGS(), aCamera, aParent, aGLAttribs,
                        wxID_ANY, wxDefaultPosition, wxDefaultSize, wxFULL_REPAINT_ON_RESIZE ),
    m_boardAdapter( aSettings )
{
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

bool EDA_3D_VIEWER_SETTINGS::MigrateFromLegacy( wxConfigBase* aLegacyConfig )
{
    (void)aLegacyConfig;
    return true;
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


// PANEL_PREVIEW_3D_MODEL stub implementations
// Required for footprint properties 3D model panel

wxDEFINE_EVENT( wxCUSTOM_PANEL_SHOWN_EVENT, wxCommandEvent );

PANEL_PREVIEW_3D_MODEL::PANEL_PREVIEW_3D_MODEL( wxWindow* aParent, PCB_BASE_FRAME* aFrame,
                                                  FOOTPRINT* aFootprint,
                                                  std::vector<FP_3DMODEL>* aParentModelList ) :
    TOOLS_HOLDER(),
    PANEL_PREVIEW_3D_MODEL_BASE( aParent ),
    m_parentFrame( aFrame ),
    m_previewPane( nullptr ),
    m_infobar( nullptr ),
    m_boardAdapter(),
    m_currentCamera( m_trackBallCamera ),
    m_trackBallCamera( 2 * RANGE_SCALE_3D ),
    m_dummyBoard( nullptr ),
    m_dummyFootprint( nullptr ),
    m_parentModelList( aParentModelList ),
    m_selected( -1 ),
    m_userUnits( EDA_UNITS::MM )
{
    (void)aFootprint;
    // 3D preview not supported in WASM
}

PANEL_PREVIEW_3D_MODEL::~PANEL_PREVIEW_3D_MODEL()
{
}

void PANEL_PREVIEW_3D_MODEL::OnMenuEvent( wxMenuEvent& aEvent )
{
    (void)aEvent;
}

void PANEL_PREVIEW_3D_MODEL::SetSelectedModel( int idx )
{
    (void)idx;
    // No-op: 3D preview not available in WASM
}

void PANEL_PREVIEW_3D_MODEL::UpdateDummyFootprint( bool aReloadRequired )
{
    (void)aReloadRequired;
    // No-op: 3D preview not available in WASM
}

void PANEL_PREVIEW_3D_MODEL::SetEmbeddedFilesDelegate( EMBEDDED_FILES* aDelegate )
{
    (void)aDelegate;
    // No-op: 3D preview not available in WASM
}


// DIALOG_SELECT_3DMODEL stub implementations

DIALOG_SELECT_3DMODEL::DIALOG_SELECT_3DMODEL( wxWindow* aParent, S3D_CACHE* aCacheManager,
                                                FP_3DMODEL* aModelItem, wxString& prevModelSelectDir,
                                                int& prevModelWildcard ) :
    DIALOG_SELECT_3D_MODEL_BASE( aParent ),
    m_model( aModelItem ),
    m_cache( aCacheManager ),
    m_resolver( nullptr ),
    m_previousDir( prevModelSelectDir ),
    m_modelViewer( nullptr )
{
    (void)prevModelWildcard;
    // 3D model selection not supported in WASM
}

bool DIALOG_SELECT_3DMODEL::TransferDataFromWindow()
{
    return true;
}

void DIALOG_SELECT_3DMODEL::OnSelectionChanged( wxCommandEvent& event )
{
    (void)event;
}

void DIALOG_SELECT_3DMODEL::OnFileActivated( wxCommandEvent& event )
{
    (void)event;
}

void DIALOG_SELECT_3DMODEL::SetRootDir( wxCommandEvent& event )
{
    (void)event;
}

void DIALOG_SELECT_3DMODEL::Cfg3DPaths( wxCommandEvent& event )
{
    (void)event;
}

void DIALOG_SELECT_3DMODEL::updateDirChoiceList()
{
}


// DIALOG_SELECT_3D_MODEL_BASE stub implementations

DIALOG_SELECT_3D_MODEL_BASE::~DIALOG_SELECT_3D_MODEL_BASE()
{
}


// TRACK_BALL stub implementations

TRACK_BALL::TRACK_BALL( float aInitialDistance ) : CAMERA( aInitialDistance )
{
    initQuat();
}

TRACK_BALL::TRACK_BALL( SFVEC3F aInitPos, SFVEC3F aLookat, PROJECTION_TYPE aProjectionType )
    : CAMERA( aInitPos, aLookat, aProjectionType )
{
    initQuat();
}

void TRACK_BALL::initQuat()
{
    m_quat_t0[0] = m_quat_t0[1] = m_quat_t0[2] = 0.0;
    m_quat_t0[3] = 1.0;
    m_quat_t1[0] = m_quat_t1[1] = m_quat_t1[2] = 0.0;
    m_quat_t1[3] = 1.0;
}

void TRACK_BALL::Drag( const wxPoint& aNewMousePosition )
{
    (void)aNewMousePosition;
}

void TRACK_BALL::Pan( const wxPoint& aNewMousePosition )
{
    (void)aNewMousePosition;
}

void TRACK_BALL::Pan( const SFVEC3F& aDeltaOffsetInc )
{
    (void)aDeltaOffsetInc;
}

void TRACK_BALL::Pan_T1( const SFVEC3F& aDeltaOffsetInc )
{
    (void)aDeltaOffsetInc;
}

void TRACK_BALL::Reset_T1()
{
}

void TRACK_BALL::SetT0_and_T1_current_T()
{
}

void TRACK_BALL::Interpolate( float t )
{
    (void)t;
}


// EDA_3D_CANVAS additional method stubs

void EDA_3D_CANVAS::OnCloseWindow( wxCloseEvent& event )
{
    (void)event;
}


// OGL_ATT_LIST stub implementations

const wxGLAttributes OGL_ATT_LIST::GetAttributesList( ANTIALIASING_MODE aAntiAliasingMode, bool aUseDepth )
{
    (void)aAntiAliasingMode;
    (void)aUseDepth;
    wxGLAttributes glAttribs;
    glAttribs.PlatformDefaults().RGBA().DoubleBuffer().EndList();
    return glAttribs;
}


// BBOX_3D stub implementations

#include <3d_rendering/raytracing/shapes3D/bbox_3d.h>

BBOX_3D::BBOX_3D()
{
    m_min = SFVEC3F( 0.0f, 0.0f, 0.0f );
    m_max = SFVEC3F( 0.0f, 0.0f, 0.0f );
}

BBOX_3D::BBOX_3D( const SFVEC3F& aPbInit ) : m_min( aPbInit ), m_max( aPbInit )
{
}

BBOX_3D::BBOX_3D( const SFVEC3F& aPbMin, const SFVEC3F& aPbMax ) : m_min( aPbMin ), m_max( aPbMax )
{
}

BBOX_3D::~BBOX_3D()
{
}


// BVH_CONTAINER_2D and base class stub implementations

#include <3d_rendering/raytracing/accelerators/container_2d.h>

CONTAINER_2D_BASE::CONTAINER_2D_BASE( OBJECT_2D_TYPE aObjType )
{
    (void)aObjType;
}

CONTAINER_2D_BASE::~CONTAINER_2D_BASE()
{
}

void CONTAINER_2D_BASE::Clear()
{
}

BVH_CONTAINER_2D::BVH_CONTAINER_2D() : CONTAINER_2D_BASE( OBJECT_2D_TYPE::FILLED_CIRCLE )
{
    m_isInitialized = false;
    m_tree = nullptr;
    m_elementsToDelete.clear();
}

BVH_CONTAINER_2D::~BVH_CONTAINER_2D()
{
}

void BVH_CONTAINER_2D::BuildBVH()
{
}

void BVH_CONTAINER_2D::Clear()
{
}

void BVH_CONTAINER_2D::GetIntersectingObjects( const BBOX_2D& aBBox, CONST_LIST_OBJECT2D& aOutList ) const
{
    (void)aBBox;
    (void)aOutList;
}

bool BVH_CONTAINER_2D::IntersectAny( const RAYSEG2D& aSegRay ) const
{
    (void)aSegRay;
    return false;
}


// PANEL_PREVIEW_3D_MODEL_BASE stub implementations

#include <dialogs/panel_preview_3d_model_base.h>

PANEL_PREVIEW_3D_MODEL_BASE::PANEL_PREVIEW_3D_MODEL_BASE( wxWindow* parent, wxWindowID id, const wxPoint& pos, const wxSize& size, long style, const wxString& name )
    : wxPanel( parent, id, pos, size, style, name )
{
}

PANEL_PREVIEW_3D_MODEL_BASE::~PANEL_PREVIEW_3D_MODEL_BASE()
{
}


// PANEL_PREVIEW_3D_MODEL additional stub implementations

void PANEL_PREVIEW_3D_MODEL::doIncrementRotation( wxSpinEvent& event, double rotationIncrement )
{
    (void)event;
    (void)rotationIncrement;
}

void PANEL_PREVIEW_3D_MODEL::doIncrementScale( wxSpinEvent& event, double scaleIncrement )
{
    (void)event;
    (void)scaleIncrement;
}

void PANEL_PREVIEW_3D_MODEL::doIncrementOffset( wxSpinEvent& event, double offsetIncrement )
{
    (void)event;
    (void)offsetIncrement;
}

void PANEL_PREVIEW_3D_MODEL::updateOrientation( wxCommandEvent& event )
{
    (void)event;
}

void PANEL_PREVIEW_3D_MODEL::onMouseWheelScale( wxMouseEvent& event )
{
    (void)event;
}

void PANEL_PREVIEW_3D_MODEL::onMouseWheelRot( wxMouseEvent& event )
{
    (void)event;
}

void PANEL_PREVIEW_3D_MODEL::onMouseWheelOffset( wxMouseEvent& event )
{
    (void)event;
}

void PANEL_PREVIEW_3D_MODEL::onOpacitySlider( wxCommandEvent& event )
{
    (void)event;
}

void PANEL_PREVIEW_3D_MODEL::setBodyStyleView( wxCommandEvent& event )
{
    (void)event;
}

void PANEL_PREVIEW_3D_MODEL::View3DSettings( wxCommandEvent& event )
{
    (void)event;
}


// EDA_3D_CANVAS additional stub implementations

bool EDA_3D_CANVAS::SetView3D( VIEW3D_TYPE aViewType )
{
    (void)aViewType;
    return false;
}


// BBOX_2D stub implementations

#include <3d_rendering/raytracing/shapes2D/bbox_2d.h>

BBOX_2D::BBOX_2D()
{
    m_min = SFVEC2F( 0.0f, 0.0f );
    m_max = SFVEC2F( 0.0f, 0.0f );
}

BBOX_2D::BBOX_2D( const SFVEC2F& aPbMin, const SFVEC2F& aPbMax ) : m_min( aPbMin ), m_max( aPbMax )
{
}

BBOX_2D::~BBOX_2D()
{
}


// DIALOG_SELECT_3D_MODEL_BASE stub implementations

#include <dialogs/dialog_select_3d_model_base.h>

DIALOG_SELECT_3D_MODEL_BASE::DIALOG_SELECT_3D_MODEL_BASE( wxWindow* parent, wxWindowID id, const wxString& title, const wxPoint& pos, const wxSize& size, long style )
    : DIALOG_SHIM( parent, id, title, pos, size, style )
{
}
