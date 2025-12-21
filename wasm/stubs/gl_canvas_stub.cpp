/*
 * OpenGL Canvas stubs for KiCad WASM build
 * OpenGL GAL is not available in WASM (uses Cairo only).
 * This stub provides typeinfo and methods for dynamic_cast to work.
 */

#include <gal/hidpi_gl_canvas.h>
#include <gal/hidpi_gl_3D_canvas.h>
#include <3d_rendering/raytracing/render_3d_raytrace_gl.h>

//=============================================================================
// Fixed-function OpenGL stubs for WebGL compatibility
// WebGL only supports OpenGL ES 2.0/3.0 which doesn't have these functions
//=============================================================================

extern "C" {

void glLoadMatrixf( const float* m )
{
    (void)m;
    // Fixed-function pipeline not available in WebGL
}

void glPushMatrix()
{
    // Fixed-function pipeline not available in WebGL
}

void glPopMatrix()
{
    // Fixed-function pipeline not available in WebGL
}

void glColor4f( float r, float g, float b, float a )
{
    (void)r; (void)g; (void)b; (void)a;
    // Fixed-function pipeline not available in WebGL
}

void glTranslatef( float x, float y, float z )
{
    (void)x; (void)y; (void)z;
    // Fixed-function pipeline not available in WebGL
}

void glScalef( float x, float y, float z )
{
    (void)x; (void)y; (void)z;
    // Fixed-function pipeline not available in WebGL
}

void glRotatef( float angle, float x, float y, float z )
{
    (void)angle; (void)x; (void)y; (void)z;
    // Fixed-function pipeline not available in WebGL
}

void glEnableClientState( unsigned int cap )
{
    (void)cap;
    // Fixed-function pipeline not available in WebGL
}

void glDisableClientState( unsigned int cap )
{
    (void)cap;
    // Fixed-function pipeline not available in WebGL
}

void glPointSize( float size )
{
    (void)size;
    // Fixed-function pipeline not available in WebGL
}

void glVertex3f( float x, float y, float z )
{
    (void)x; (void)y; (void)z;
    // Immediate mode not available in WebGL
}

void glBegin( unsigned int mode )
{
    (void)mode;
    // Immediate mode not available in WebGL
}

void glEnd()
{
    // Immediate mode not available in WebGL
}

void glColorMaterial( unsigned int face, unsigned int mode )
{
    (void)face; (void)mode;
    // Fixed-function pipeline not available in WebGL
}

void glNormalPointer( unsigned int type, int stride, const void* pointer )
{
    (void)type; (void)stride; (void)pointer;
    // Fixed-function pipeline not available in WebGL
}

void glColorPointer( int size, unsigned int type, int stride, const void* pointer )
{
    (void)size; (void)type; (void)stride; (void)pointer;
    // Fixed-function pipeline not available in WebGL
}

void glTexCoordPointer( int size, unsigned int type, int stride, const void* pointer )
{
    (void)size; (void)type; (void)stride; (void)pointer;
    // Fixed-function pipeline not available in WebGL
}

void glVertexPointer( int size, unsigned int type, int stride, const void* pointer )
{
    (void)size; (void)type; (void)stride; (void)pointer;
    // Fixed-function pipeline not available in WebGL
}

void glMaterialfv( unsigned int face, unsigned int pname, const float* params )
{
    (void)face; (void)pname; (void)params;
    // Fixed-function pipeline not available in WebGL
}

void glMaterialf( unsigned int face, unsigned int pname, float param )
{
    (void)face; (void)pname; (void)param;
    // Fixed-function pipeline not available in WebGL
}

void glLightfv( unsigned int light, unsigned int pname, const float* params )
{
    (void)light; (void)pname; (void)params;
    // Fixed-function pipeline not available in WebGL
}

void glLightModelfv( unsigned int pname, const float* params )
{
    (void)pname; (void)params;
    // Fixed-function pipeline not available in WebGL
}

void glNormal3f( float nx, float ny, float nz )
{
    (void)nx; (void)ny; (void)nz;
    // Fixed-function pipeline not available in WebGL
}

void glTexCoord2f( float s, float t )
{
    (void)s; (void)t;
    // Fixed-function pipeline not available in WebGL
}

void glMatrixMode( unsigned int mode )
{
    (void)mode;
    // Fixed-function pipeline not available in WebGL
}

void glLoadIdentity()
{
    // Fixed-function pipeline not available in WebGL
}

void glOrtho( double left, double right, double bottom, double top, double nearVal, double farVal )
{
    (void)left; (void)right; (void)bottom; (void)top; (void)nearVal; (void)farVal;
    // Fixed-function pipeline not available in WebGL
}

void glFrustum( double left, double right, double bottom, double top, double nearVal, double farVal )
{
    (void)left; (void)right; (void)bottom; (void)top; (void)nearVal; (void)farVal;
    // Fixed-function pipeline not available in WebGL
}

void glMultMatrixf( const float* m )
{
    (void)m;
    // Fixed-function pipeline not available in WebGL
}

void glShadeModel( unsigned int mode )
{
    (void)mode;
    // Fixed-function pipeline not available in WebGL
}

void glTexEnvfv( unsigned int target, unsigned int pname, const float* params )
{
    (void)target; (void)pname; (void)params;
    // Fixed-function pipeline not available in WebGL
}

void glTexEnvf( unsigned int target, unsigned int pname, float param )
{
    (void)target; (void)pname; (void)param;
    // Fixed-function pipeline not available in WebGL
}

void glTexEnvi( unsigned int target, unsigned int pname, int param )
{
    (void)target; (void)pname; (void)param;
    // Fixed-function pipeline not available in WebGL
}

void glLightModeli( unsigned int pname, int param )
{
    (void)pname; (void)param;
    // Fixed-function pipeline not available in WebGL
}

// Display lists - not available in WebGL
unsigned char glIsList( unsigned int list )
{
    (void)list;
    return 0;  // Always return false - no display lists in WebGL
}

void glDeleteLists( unsigned int list, int range )
{
    (void)list; (void)range;
    // Display lists not available in WebGL
}

unsigned int glGenLists( int range )
{
    (void)range;
    return 0;  // Return 0 to indicate failure - no display lists in WebGL
}

void glNewList( unsigned int list, unsigned int mode )
{
    (void)list; (void)mode;
    // Display lists not available in WebGL
}

void glEndList()
{
    // Display lists not available in WebGL
}

void glCallList( unsigned int list )
{
    (void)list;
    // Display lists not available in WebGL
}

void glCallLists( int n, unsigned int type, const void* lists )
{
    (void)n; (void)type; (void)lists;
    // Display lists not available in WebGL
}

// More fixed-function pipeline functions
void glColor3f( float r, float g, float b )
{
    (void)r; (void)g; (void)b;
    // Fixed-function pipeline not available in WebGL
}

void glColor3fv( const float* v )
{
    (void)v;
    // Fixed-function pipeline not available in WebGL
}

void glColor4fv( const float* v )
{
    (void)v;
    // Fixed-function pipeline not available in WebGL
}

void glVertex2f( float x, float y )
{
    (void)x; (void)y;
    // Immediate mode not available in WebGL
}

void glVertex3fv( const float* v )
{
    (void)v;
    // Immediate mode not available in WebGL
}

void glNormal3fv( const float* v )
{
    (void)v;
    // Fixed-function pipeline not available in WebGL
}

void glRectf( float x1, float y1, float x2, float y2 )
{
    (void)x1; (void)y1; (void)x2; (void)y2;
    // Immediate mode not available in WebGL
}

void glLineWidth( float width )
{
    (void)width;
    // Note: WebGL has limited line width support
}

void glAlphaFunc( unsigned int func, float ref )
{
    (void)func; (void)ref;
    // Fixed-function pipeline not available in WebGL
}

void glClientActiveTexture( unsigned int texture )
{
    (void)texture;
    // Fixed-function pipeline not available in WebGL
}

void glScaled( double x, double y, double z )
{
    (void)x; (void)y; (void)z;
    // Fixed-function pipeline not available in WebGL
}

void glPolygonMode( unsigned int face, unsigned int mode )
{
    (void)face; (void)mode;
    // Not available in WebGL ES
}

void glClipPlane( unsigned int plane, const double* equation )
{
    (void)plane; (void)equation;
    // Fixed-function pipeline not available in WebGL
}

void glFogf( unsigned int pname, float param )
{
    (void)pname; (void)param;
    // Fixed-function pipeline not available in WebGL
}

void glFogfv( unsigned int pname, const float* params )
{
    (void)pname; (void)params;
    // Fixed-function pipeline not available in WebGL
}

void glFogi( unsigned int pname, int param )
{
    (void)pname; (void)param;
    // Fixed-function pipeline not available in WebGL
}

} // extern "C"

//=============================================================================
// HIDPI_GL_CANVAS stub implementation
//=============================================================================

HIDPI_GL_CANVAS::HIDPI_GL_CANVAS( const KIGFX::VC_SETTINGS& aSettings, wxWindow* aParent,
                                  const wxGLAttributes& aGLAttribs, wxWindowID aId,
                                  const wxPoint& aPos, const wxSize& aSize, long aStyle,
                                  const wxString& aName, const wxPalette& aPalette ) :
        wxGLCanvas( aParent, aGLAttribs, aId, aPos, aSize, aStyle, aName, aPalette ),
        m_settings( aSettings )
{
    // Not used in WASM - OpenGL is disabled
}

wxSize HIDPI_GL_CANVAS::GetNativePixelSize() const
{
    return wxSize( 0, 0 );
}

wxPoint HIDPI_GL_CANVAS::GetNativePosition( const wxPoint& aPoint ) const
{
    return aPoint;
}

double HIDPI_GL_CANVAS::GetScaleFactor() const
{
    return 1.0;  // No HiDPI scaling in WASM stub
}

//=============================================================================
// HIDPI_GL_3D_CANVAS stub implementation
//=============================================================================

const float HIDPI_GL_3D_CANVAS::m_delta_move_step_factor = 0.7f;

HIDPI_GL_3D_CANVAS::HIDPI_GL_3D_CANVAS( const KIGFX::VC_SETTINGS& aVcSettings, CAMERA& aCamera,
                                        wxWindow* aParent, const wxGLAttributes& aGLAttribs,
                                        wxWindowID aId, const wxPoint& aPos, const wxSize& aSize,
                                        long aStyle, const wxString& aName,
                                        const wxPalette& aPalette ) :
        HIDPI_GL_CANVAS( aVcSettings, aParent, aGLAttribs, aId, aPos, aSize, aStyle, aName, aPalette ),
        m_camera( aCamera )
{
    m_mouse_is_moving = false;
    m_mouse_was_moved = false;
    m_camera_is_moving = false;
    // Not used in WASM - 3D viewer uses RAM raytracer
}

void HIDPI_GL_3D_CANVAS::OnMouseMoveCamera( wxMouseEvent& event )
{
    (void)event;
    // Not used in WASM
}

void HIDPI_GL_3D_CANVAS::OnMouseWheelCamera( wxMouseEvent& event, bool aPan )
{
    (void)event;
    (void)aPan;
    // Not used in WASM
}

//=============================================================================
// RENDER_3D_RAYTRACE_GL stub implementation
//=============================================================================

RENDER_3D_RAYTRACE_GL::RENDER_3D_RAYTRACE_GL( EDA_3D_CANVAS* aCanvas, BOARD_ADAPTER& aAdapter,
                                              CAMERA& aCamera ) :
        RENDER_3D_RAYTRACE_BASE( aAdapter, aCamera )
{
    (void)aCanvas;
    m_openglSupportsVertexBufferObjects = false;
    m_pboId = 0;
    m_pboDataSize = 0;
    // Not used in WASM - uses RAM raytracer instead
}

RENDER_3D_RAYTRACE_GL::~RENDER_3D_RAYTRACE_GL()
{
}

void RENDER_3D_RAYTRACE_GL::SetCurWindowSize( const wxSize& aSize )
{
    (void)aSize;
    // Not used in WASM
}

bool RENDER_3D_RAYTRACE_GL::Redraw( bool aIsMoving, REPORTER* aStatusReporter,
                                    REPORTER* aWarningReporter )
{
    (void)aIsMoving;
    (void)aStatusReporter;
    (void)aWarningReporter;
    return false;  // Not used in WASM
}

void RENDER_3D_RAYTRACE_GL::initPbo()
{
    // Not used in WASM
}

void RENDER_3D_RAYTRACE_GL::deletePbo()
{
    // Not used in WASM
}

//=============================================================================
// NavLib/3DConnexion SpaceMouse plugin stubs
// These are for 3D mouse support which is not available in WASM
//=============================================================================

// Define empty implementation classes to satisfy unique_ptr
class NL_3D_VIEWER_PLUGIN_IMPL {};
class NL_FOOTPRINT_PROPERTIES_PLUGIN_IMPL {};

#include <3d_navlib/nl_3d_viewer_plugin.h>
#include <3d_navlib/nl_footprint_properties_plugin.h>

NL_3D_VIEWER_PLUGIN::NL_3D_VIEWER_PLUGIN( EDA_3D_CANVAS* aViewport ) :
        m_impl( nullptr )
{
    (void)aViewport;
    // SpaceMouse not available in WASM
}

NL_3D_VIEWER_PLUGIN::~NL_3D_VIEWER_PLUGIN()
{
}

void NL_3D_VIEWER_PLUGIN::SetFocus( bool aFocus )
{
    (void)aFocus;
    // SpaceMouse not available in WASM
}

NL_FOOTPRINT_PROPERTIES_PLUGIN::NL_FOOTPRINT_PROPERTIES_PLUGIN( EDA_3D_CANVAS* aViewport ) :
        m_impl( nullptr )
{
    (void)aViewport;
    // SpaceMouse not available in WASM
}

NL_FOOTPRINT_PROPERTIES_PLUGIN::~NL_FOOTPRINT_PROPERTIES_PLUGIN()
{
}

void NL_FOOTPRINT_PROPERTIES_PLUGIN::SetFocus( bool aFocus )
{
    (void)aFocus;
    // SpaceMouse not available in WASM
}
