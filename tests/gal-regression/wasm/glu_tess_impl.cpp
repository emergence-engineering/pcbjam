/**
 * GLU Tesselator implementation using Mapbox earcut
 *
 * Provides GLU tessellation API for WebGL/WASM builds.
 * Uses earcut.hpp for polygon triangulation instead of native GLU library.
 */

#include "earcut.hpp"
#include <vector>
#include <array>
#include <cstring>

// GL types
typedef double GLdouble;
typedef float GLfloat;
typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef void GLvoid;
typedef void (*_GLUfuncptr)(void);

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

#ifndef GL_TRUE
#define GL_TRUE 1
#endif
#ifndef GL_FALSE
#define GL_FALSE 0
#endif

// Vertex data stored during tessellation
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

    // Convert to earcut format: vector of rings, each ring is vector of points
    // earcut expects std::array<T, 2> or similar for 2D points
    using Point = std::array<double, 2>;
    std::vector<std::vector<Point>> polygon;

    for (const auto& contour : tess->contours) {
        std::vector<Point> ring;
        for (const auto& v : contour) {
            ring.push_back({v.coords[0], v.coords[1]});
        }
        polygon.push_back(ring);
    }

    // Run earcut triangulation
    std::vector<uint32_t> indices = mapbox::earcut<uint32_t>(polygon);

    // Build flat vertex list for index lookup
    std::vector<const TessVertex*> allVertices;
    for (const auto& contour : tess->contours) {
        for (const auto& v : contour) {
            allVertices.push_back(&v);
        }
    }

    // Call edge flag callback to indicate we're producing triangles
    // (edge flag callback forces GLU to output only triangles, which earcut always does)
    if (tess->edgeFlagDataCallback)
        tess->edgeFlagDataCallback(GL_TRUE, tess->polygonUserData);
    else if (tess->edgeFlagCallback)
        tess->edgeFlagCallback(GL_TRUE);

    // Output triangles via vertex callback
    // Each triangle is 3 consecutive indices
    for (size_t i = 0; i < indices.size(); i += 3) {
        // Get vertex indices for this triangle
        uint32_t idx0 = indices[i];
        uint32_t idx1 = indices[i + 1];
        uint32_t idx2 = indices[i + 2];

        // Emit the three vertices
        if (tess->vertexDataCallback) {
            tess->vertexDataCallback(allVertices[idx0]->userData, tess->polygonUserData);
            tess->vertexDataCallback(allVertices[idx1]->userData, tess->polygonUserData);
            tess->vertexDataCallback(allVertices[idx2]->userData, tess->polygonUserData);
        } else if (tess->vertexCallback) {
            tess->vertexCallback(allVertices[idx0]->userData);
            tess->vertexCallback(allVertices[idx1]->userData);
            tess->vertexCallback(allVertices[idx2]->userData);
        }
    }
}

const unsigned char* gluErrorString(GLenum error)
{
    static const unsigned char errStr[] = "GLU tesselator error";
    (void)error;
    return errStr;
}

} // extern "C"
