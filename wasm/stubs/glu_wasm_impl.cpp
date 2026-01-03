/**
 * GLU Tesselator implementation for WebAssembly builds
 *
 * Uses KiCad's earcut-based POLYGON_TRIANGULATION instead of GLU library.
 * This enables OpenGL GAL to work in WASM with proper polygon triangulation.
 */

#include <vector>
#include <array>
#include <cstring>

#include <geometry/shape_line_chain.h>
#include <geometry/shape_poly_set.h>
#include <geometry/polygon_triangulation.h>

// GL types
typedef double GLdouble;
typedef float GLfloat;
typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef void GLvoid;
typedef void (*_GLUfuncptr)(void);

// GL constants
#ifndef GL_TRUE
#define GL_TRUE 1
#endif
#ifndef GL_FALSE
#define GL_FALSE 0
#endif

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

#define GLU_TESS_WINDING_RULE   100140
#define GLU_TESS_WINDING_ODD    100130
#define GLU_TESS_WINDING_NONZERO 100131
#define GLU_TESS_WINDING_POSITIVE 100132
#define GLU_TESS_WINDING_NEGATIVE 100133
#define GLU_TESS_WINDING_ABS_GEQ_TWO 100134

// Vertex data stored during tesselation
struct TessVertex
{
    std::array<GLdouble, 3> coords;
    void* userData;  // The data pointer passed to gluTessVertex
};

struct GLUtesselator
{
    // Callbacks
    void (*vertexCallback)(void* vertex) = nullptr;
    void (*vertexDataCallback)(void* vertex, void* userData) = nullptr;
    void (*combineCallback)(GLdouble coords[3], void* vertex_data[4],
                            GLfloat weight[4], void** dataOut) = nullptr;
    void (*combineDataCallback)(GLdouble coords[3], void* vertex_data[4],
                                GLfloat weight[4], void** dataOut, void* userData) = nullptr;
    void (*edgeFlagCallback)(GLboolean flag) = nullptr;
    void (*edgeFlagDataCallback)(GLboolean flag, void* userData) = nullptr;
    void (*errorCallback)(GLenum error) = nullptr;
    void (*errorDataCallback)(GLenum error, void* userData) = nullptr;
    void (*beginCallback)(GLenum type) = nullptr;
    void (*beginDataCallback)(GLenum type, void* userData) = nullptr;
    void (*endCallback)() = nullptr;
    void (*endDataCallback)(void* userData) = nullptr;

    // Contour data - each contour is a list of vertices
    std::vector<std::vector<TessVertex>> contours;
    std::vector<TessVertex>* currentContour = nullptr;

    // User data passed to gluTessBeginPolygon
    void* polygonUserData = nullptr;

    // Properties
    GLenum windingRule = GLU_TESS_WINDING_POSITIVE;
};

extern "C" {

GLUtesselator* gluNewTess()
{
    return new GLUtesselator();
}

void gluDeleteTess(GLUtesselator* tess)
{
    delete tess;
}

void gluTessCallback(GLUtesselator* tess, GLenum which, _GLUfuncptr fn)
{
    if (!tess) return;

    switch (which) {
        case GLU_TESS_VERTEX:
            tess->vertexCallback = (void(*)(void*))fn;
            break;
        case GLU_TESS_VERTEX_DATA:
            tess->vertexDataCallback = (void(*)(void*, void*))fn;
            break;
        case GLU_TESS_COMBINE:
            tess->combineCallback = (void(*)(GLdouble[3], void*[4], GLfloat[4], void**))fn;
            break;
        case GLU_TESS_COMBINE_DATA:
            tess->combineDataCallback = (void(*)(GLdouble[3], void*[4], GLfloat[4], void**, void*))fn;
            break;
        case GLU_TESS_EDGE_FLAG:
            tess->edgeFlagCallback = (void(*)(GLboolean))fn;
            break;
        case GLU_TESS_EDGE_FLAG_DATA:
            tess->edgeFlagDataCallback = (void(*)(GLboolean, void*))fn;
            break;
        case GLU_TESS_ERROR:
            tess->errorCallback = (void(*)(GLenum))fn;
            break;
        case GLU_TESS_ERROR_DATA:
            tess->errorDataCallback = (void(*)(GLenum, void*))fn;
            break;
        case GLU_TESS_BEGIN:
            tess->beginCallback = (void(*)(GLenum))fn;
            break;
        case GLU_TESS_BEGIN_DATA:
            tess->beginDataCallback = (void(*)(GLenum, void*))fn;
            break;
        case GLU_TESS_END:
            tess->endCallback = (void(*)())fn;
            break;
        case GLU_TESS_END_DATA:
            tess->endDataCallback = (void(*)(void*))fn;
            break;
    }
}

void gluTessProperty(GLUtesselator* tess, GLenum which, GLdouble value)
{
    if (!tess) return;

    if (which == GLU_TESS_WINDING_RULE)
        tess->windingRule = static_cast<GLenum>(value);
}

void gluGetTessProperty(GLUtesselator* tess, GLenum which, GLdouble* value)
{
    if (!tess || !value) return;

    if (which == GLU_TESS_WINDING_RULE)
        *value = static_cast<GLdouble>(tess->windingRule);
}

void gluTessNormal(GLUtesselator* tess, GLdouble x, GLdouble y, GLdouble z)
{
    // Ignored - earcut works in 2D (XY plane)
    (void)tess; (void)x; (void)y; (void)z;
}

void gluTessBeginPolygon(GLUtesselator* tess, void* userData)
{
    if (!tess) return;

    tess->contours.clear();
    tess->currentContour = nullptr;
    tess->polygonUserData = userData;
}

void gluTessBeginContour(GLUtesselator* tess)
{
    if (!tess) return;

    tess->contours.emplace_back();
    tess->currentContour = &tess->contours.back();
}

void gluTessVertex(GLUtesselator* tess, GLdouble coords[3], void* data)
{
    if (!tess || !tess->currentContour) return;

    TessVertex v;
    v.coords = {coords[0], coords[1], coords[2]};
    v.userData = data;
    tess->currentContour->push_back(v);
}

void gluTessEndContour(GLUtesselator* tess)
{
    if (!tess) return;
    tess->currentContour = nullptr;
}

void gluTessEndPolygon(GLUtesselator* tess)
{
    if (!tess) return;

    // Need at least one contour with 3+ vertices
    if (tess->contours.empty())
        return;

    const auto& mainContour = tess->contours[0];
    if (mainContour.size() < 3)
        return;

    // Convert to SHAPE_LINE_CHAIN for earcut
    // Note: earcut works with integer coordinates, so we scale appropriately
    // KiCad uses nanometers internally, so coordinates are already integers
    SHAPE_LINE_CHAIN chain;
    for (const auto& v : mainContour) {
        chain.Append(VECTOR2I(static_cast<int>(v.coords[0]),
                              static_cast<int>(v.coords[1])));
    }
    chain.SetClosed(true);

    // Triangulate using KiCad's earcut implementation
    SHAPE_POLY_SET::TRIANGULATED_POLYGON result(-1);
    POLYGON_TRIANGULATION triangulator(result);

    if (!triangulator.TesselatePolygon(chain, nullptr)) {
        // Tesselation failed - call error callback if registered
        if (tess->errorDataCallback)
            tess->errorDataCallback(100151, tess->polygonUserData); // GLU_TESS_ERROR1
        else if (tess->errorCallback)
            tess->errorCallback(100151);
        return;
    }

    // Call edge flag callback to indicate we're producing triangles
    // (edge flag callback forces GLU to output only triangles, which earcut always does)
    if (tess->edgeFlagDataCallback)
        tess->edgeFlagDataCallback(GL_TRUE, tess->polygonUserData);
    else if (tess->edgeFlagCallback)
        tess->edgeFlagCallback(GL_TRUE);

    // Output triangles via vertex callback
    // The result contains triangle indices that map back to input vertices
    size_t triCount = result.GetTriangleCount();

    for (size_t i = 0; i < triCount; i++) {
        VECTOR2I a, b, c;
        result.GetTriangle(i, a, b, c);

        // Find the original vertex indices by matching coordinates
        // (POLYGON_TRIANGULATION preserves vertex order for the first N vertices)
        auto findVertex = [&](const VECTOR2I& pt) -> size_t {
            for (size_t j = 0; j < mainContour.size(); j++) {
                if (static_cast<int>(mainContour[j].coords[0]) == pt.x &&
                    static_cast<int>(mainContour[j].coords[1]) == pt.y) {
                    return j;
                }
            }
            return 0; // fallback
        };

        size_t idxA = findVertex(a);
        size_t idxB = findVertex(b);
        size_t idxC = findVertex(c);

        // Call vertex callback for each triangle vertex
        // The callback receives the user data pointer that was passed to gluTessVertex
        if (tess->vertexDataCallback) {
            tess->vertexDataCallback(mainContour[idxA].userData, tess->polygonUserData);
            tess->vertexDataCallback(mainContour[idxB].userData, tess->polygonUserData);
            tess->vertexDataCallback(mainContour[idxC].userData, tess->polygonUserData);
        } else if (tess->vertexCallback) {
            tess->vertexCallback(mainContour[idxA].userData);
            tess->vertexCallback(mainContour[idxB].userData);
            tess->vertexCallback(mainContour[idxC].userData);
        }
    }
}

const unsigned char* gluErrorString(GLenum error)
{
    static const unsigned char errStr[] = "GLU tesselator error";
    (void)error;
    return errStr;
}

//=============================================================================
// Quadric stubs - not implemented (used for 3D primitives, not critical)
//=============================================================================

typedef struct GLUquadric GLUquadric;

GLUquadric* gluNewQuadric()
{
    return nullptr;
}

void gluDeleteQuadric(GLUquadric* q)
{
    (void)q;
}

void gluQuadricDrawStyle(GLUquadric* q, int s)
{
    (void)q; (void)s;
}

void gluQuadricNormals(GLUquadric* q, int n)
{
    (void)q; (void)n;
}

void gluCylinder(GLUquadric* q, double b, double t, double h, int sl, int st)
{
    (void)q; (void)b; (void)t; (void)h; (void)sl; (void)st;
}

void gluDisk(GLUquadric* q, double i, double o, int sl, int lp)
{
    (void)q; (void)i; (void)o; (void)sl; (void)lp;
}

void gluSphere(GLUquadric* q, double r, int sl, int st)
{
    (void)q; (void)r; (void)sl; (void)st;
}

void gluPerspective(double fovy, double aspect, double zNear, double zFar)
{
    (void)fovy; (void)aspect; (void)zNear; (void)zFar;
}

} // extern "C"
