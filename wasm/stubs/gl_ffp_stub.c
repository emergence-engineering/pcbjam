/*
 * Fixed-function-pipeline (FFP) no-op stubs for the WASM 3D-viewer build.
 *
 * KiCad's 3D "OpenGL" renderer (under 3d-viewer/3d_rendering/opengl) is pure
 * GL 1.x fixed-function: immediate mode, display lists, the matrix stack,
 * FFP lighting/material, client-state vertex arrays and GLU quadrics. None of
 * those entry points exist in WebGL2 / GLES3.
 *
 * On WASM we do NOT render through that renderer — the 3D viewer draws with the
 * GL-free CPU raytracer (RENDER_3D_RAYTRACE_RAM) and blits the result with a
 * plain WebGL2 textured quad (see EDA_3D_CANVAS). The fixed-function renderer is
 * still compiled (it is referenced from several shared files: eda_3d_canvas,
 * appearance_controls_3D, panel_preview_3d_model, eda_3d_controller), so its FFP
 * calls must *link*. These no-op definitions satisfy the linker without dragging
 * in Emscripten's -sLEGACY_GL_EMULATION (which is module-global, ~200 KB, and was
 * rejected for this project — see docs/features/fork-cleanup/10-3d-viewer.md).
 * The functions are never executed at runtime; they only need to exist.
 *
 * Signatures are taken verbatim from Emscripten's <GL/gl.h> (and the project's
 * GLU stub <GL/glu.h>) so the compiler validates them against the same
 * declarations the renderer is built against.
 *
 * Only the symbols absent from core WebGL2/GLES3 are stubbed here. Modern entry
 * points (glDrawArrays, glGenBuffers, glUseProgram, glTexImage2D, …) are provided
 * by Emscripten's WebGL library and must NOT be redefined.
 */

#include <GL/gl.h>
#include <GL/glu.h>   /* resolved to wasm/stubs/GL/glu.h via -I${STUBS_DIR} */

/* ---- Immediate mode --------------------------------------------------- */
void glBegin( GLenum mode ) { (void) mode; }
void glEnd( void ) {}
void glVertex2f( GLfloat x, GLfloat y ) { (void) x; (void) y; }
void glVertex3f( GLfloat x, GLfloat y, GLfloat z ) { (void) x; (void) y; (void) z; }
void glVertex3d( GLdouble x, GLdouble y, GLdouble z ) { (void) x; (void) y; (void) z; }
void glNormal3f( GLfloat nx, GLfloat ny, GLfloat nz ) { (void) nx; (void) ny; (void) nz; }
void glColor3f( GLfloat r, GLfloat g, GLfloat b ) { (void) r; (void) g; (void) b; }
void glColor4f( GLfloat r, GLfloat g, GLfloat b, GLfloat a ) { (void) r; (void) g; (void) b; (void) a; }

/* ---- Display lists ---------------------------------------------------- */
GLuint    glGenLists( GLsizei range ) { (void) range; return 1; }
void      glNewList( GLuint list, GLenum mode ) { (void) list; (void) mode; }
void      glEndList( void ) {}
void      glCallList( GLuint list ) { (void) list; }
void      glDeleteLists( GLuint list, GLsizei range ) { (void) list; (void) range; }
GLboolean glIsList( GLuint list ) { (void) list; return GL_FALSE; }

/* ---- Matrix stack ----------------------------------------------------- */
void glMatrixMode( GLenum mode ) { (void) mode; }
void glLoadIdentity( void ) {}
void glLoadMatrixf( const GLfloat* m ) { (void) m; }
void glPushMatrix( void ) {}
void glPopMatrix( void ) {}
void glTranslatef( GLfloat x, GLfloat y, GLfloat z ) { (void) x; (void) y; (void) z; }
void glRotatef( GLfloat angle, GLfloat x, GLfloat y, GLfloat z ) { (void) angle; (void) x; (void) y; (void) z; }
void glScalef( GLfloat x, GLfloat y, GLfloat z ) { (void) x; (void) y; (void) z; }
void glScaled( GLdouble x, GLdouble y, GLdouble z ) { (void) x; (void) y; (void) z; }

/* ---- Fixed-function lighting / material ------------------------------- */
void glShadeModel( GLenum mode ) { (void) mode; }
void glLightfv( GLenum light, GLenum pname, const GLfloat* params ) { (void) light; (void) pname; (void) params; }
void glLightModeli( GLenum pname, GLint param ) { (void) pname; (void) param; }
void glLightModelfv( GLenum pname, const GLfloat* params ) { (void) pname; (void) params; }
void glMaterialf( GLenum face, GLenum pname, GLfloat param ) { (void) face; (void) pname; (void) param; }
void glMaterialfv( GLenum face, GLenum pname, const GLfloat* params ) { (void) face; (void) pname; (void) params; }
void glColorMaterial( GLenum face, GLenum mode ) { (void) face; (void) mode; }

/* ---- Client-state vertex arrays --------------------------------------- */
void glEnableClientState( GLenum cap ) { (void) cap; }
void glDisableClientState( GLenum cap ) { (void) cap; }
void glClientActiveTexture( GLenum texture ) { (void) texture; }
void glVertexPointer( GLint size, GLenum type, GLsizei stride, const GLvoid* ptr ) { (void) size; (void) type; (void) stride; (void) ptr; }
void glNormalPointer( GLenum type, GLsizei stride, const GLvoid* ptr ) { (void) type; (void) stride; (void) ptr; }
void glColorPointer( GLint size, GLenum type, GLsizei stride, const GLvoid* ptr ) { (void) size; (void) type; (void) stride; (void) ptr; }
void glTexCoordPointer( GLint size, GLenum type, GLsizei stride, const GLvoid* ptr ) { (void) size; (void) type; (void) stride; (void) ptr; }

/* ---- Fixed-function texture environment ------------------------------- */
void glTexEnvf( GLenum target, GLenum pname, GLfloat param ) { (void) target; (void) pname; (void) param; }
void glTexEnvi( GLenum target, GLenum pname, GLint param ) { (void) target; (void) pname; (void) param; }
void glTexEnvfv( GLenum target, GLenum pname, const GLfloat* params ) { (void) target; (void) pname; (void) params; }

/* ---- Misc fixed-function state absent from GLES3 ---------------------- */
void glAlphaFunc( GLenum func, GLclampf ref ) { (void) func; (void) ref; }
void glPolygonMode( GLenum face, GLenum mode ) { (void) face; (void) mode; }
void glClearDepth( GLclampd depth ) { (void) depth; }
void glPointSize( GLfloat size ) { (void) size; }

/* ---- GLU quadrics (vias/pads/gizmo) + gluPerspective ------------------ */
/* GLUquadric is an opaque/incomplete type; hand back a stable non-null pointer
 * the renderer can store and pass to the (no-op) quadric calls below. */
static int g_dummyQuadric;
GLUquadric* gluNewQuadric( void ) { return (GLUquadric*) &g_dummyQuadric; }
void gluDeleteQuadric( GLUquadric* q ) { (void) q; }
void gluQuadricDrawStyle( GLUquadric* q, GLenum style ) { (void) q; (void) style; }
void gluQuadricNormals( GLUquadric* q, GLenum normals ) { (void) q; (void) normals; }
void gluCylinder( GLUquadric* q, double base, double top, double height, int slices, int stacks )
{ (void) q; (void) base; (void) top; (void) height; (void) slices; (void) stacks; }
void gluDisk( GLUquadric* q, double inner, double outer, int slices, int loops )
{ (void) q; (void) inner; (void) outer; (void) slices; (void) loops; }
void gluSphere( GLUquadric* q, double radius, int slices, int stacks )
{ (void) q; (void) radius; (void) slices; (void) stacks; }
void gluPerspective( double fovy, double aspect, double zNear, double zFar )
{ (void) fovy; (void) aspect; (void) zNear; (void) zFar; }
