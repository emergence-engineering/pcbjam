/**
 * GLU header for WebAssembly builds
 *
 * Provides GLU function declarations. Implementation is in glu_wasm_impl.cpp
 * which uses KiCad's earcut-based polygon triangulation.
 */

#ifndef __GLU_H__
#define __GLU_H__

#include <GLES2/gl2.h>

#ifdef __cplusplus
extern "C" {
#endif

// GLU types
typedef double GLdouble;
typedef void (*_GLUfuncptr)(void);
typedef struct GLUtesselator GLUtesselator;
typedef struct GLUquadric GLUquadric;

// GLU constants
#define GLU_TESS_BEGIN          100100
#define GLU_TESS_VERTEX         100101
#define GLU_TESS_END            100102
#define GLU_TESS_ERROR          100103
#define GLU_TESS_EDGE_FLAG      100104
#define GLU_TESS_COMBINE        100105
#define GLU_TESS_BEGIN_DATA     100106
#define GLU_TESS_VERTEX_DATA    100107
#define GLU_TESS_END_DATA       100108
#define GLU_TESS_ERROR_DATA     100109
#define GLU_TESS_EDGE_FLAG_DATA 100110
#define GLU_TESS_COMBINE_DATA   100111

#define GLU_TESS_WINDING_RULE       100140
#define GLU_TESS_WINDING_ODD        100130
#define GLU_TESS_WINDING_NONZERO    100131
#define GLU_TESS_WINDING_POSITIVE   100132
#define GLU_TESS_WINDING_NEGATIVE   100133
#define GLU_TESS_WINDING_ABS_GEQ_TWO 100134

// Tesselator functions
GLUtesselator* gluNewTess(void);
void gluDeleteTess(GLUtesselator* tess);
void gluTessCallback(GLUtesselator* tess, GLenum which, _GLUfuncptr fn);
void gluTessProperty(GLUtesselator* tess, GLenum which, GLdouble value);
void gluGetTessProperty(GLUtesselator* tess, GLenum which, GLdouble* value);
void gluTessNormal(GLUtesselator* tess, GLdouble x, GLdouble y, GLdouble z);
void gluTessBeginPolygon(GLUtesselator* tess, void* userData);
void gluTessBeginContour(GLUtesselator* tess);
void gluTessVertex(GLUtesselator* tess, GLdouble coords[3], void* data);
void gluTessEndContour(GLUtesselator* tess);
void gluTessEndPolygon(GLUtesselator* tess);
const unsigned char* gluErrorString(GLenum error);

// Quadric constants
#define GLU_OUTSIDE             100020
#define GLU_INSIDE              100021
#define GLU_POINT               100010
#define GLU_LINE                100011
#define GLU_FILL                100012
#define GLU_SILHOUETTE          100013
#define GLU_SMOOTH              100000
#define GLU_FLAT                100001
#define GLU_NONE                100002

// Quadric type aliases
typedef GLUquadric GLUquadricObj;

// Quadric functions (stubs - not implemented for WASM)
GLUquadric* gluNewQuadric(void);
void gluDeleteQuadric(GLUquadric* q);
void gluQuadricDrawStyle(GLUquadric* q, GLenum style);
void gluQuadricNormals(GLUquadric* q, GLenum normals);
void gluCylinder(GLUquadric* q, double base, double top, double height, int slices, int stacks);
void gluDisk(GLUquadric* q, double inner, double outer, int slices, int loops);
void gluSphere(GLUquadric* q, double radius, int slices, int stacks);

// Matrix functions (stub)
void gluPerspective(double fovy, double aspect, double zNear, double zFar);

#ifdef __cplusplus
}
#endif

#endif /* __GLU_H__ */
