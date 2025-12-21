/* GLU stubs for WebAssembly builds
 * GLU is not available in WebGL, these stubs prevent link errors.
 * The gizmo won't render but the 3D view should work with LEGACY_GL_EMULATION.
 */

typedef struct GLUquadric GLUquadric;
typedef struct GLUtesselator GLUtesselator;
typedef double GLdouble;
typedef void (*_GLUfuncptr)(void);

/* Quadric stubs */
GLUquadric* gluNewQuadric(void) { return (GLUquadric*)0; }
void gluDeleteQuadric(GLUquadric* q) { (void)q; }
void gluQuadricDrawStyle(GLUquadric* q, int s) { (void)q; (void)s; }
void gluQuadricNormals(GLUquadric* q, int n) { (void)q; (void)n; }
void gluCylinder(GLUquadric* q, double b, double t, double h, int sl, int st) {
    (void)q; (void)b; (void)t; (void)h; (void)sl; (void)st;
}
void gluDisk(GLUquadric* q, double i, double o, int sl, int lp) {
    (void)q; (void)i; (void)o; (void)sl; (void)lp;
}
void gluSphere(GLUquadric* q, double r, int sl, int st) {
    (void)q; (void)r; (void)sl; (void)st;
}
void gluPerspective(double fovy, double aspect, double zNear, double zFar) {
    (void)fovy; (void)aspect; (void)zNear; (void)zFar;
}

/* Tessellation stubs */
GLUtesselator* gluNewTess(void) { return (GLUtesselator*)0; }
void gluDeleteTess(GLUtesselator* t) { (void)t; }
void gluTessBeginPolygon(GLUtesselator* t, void* d) { (void)t; (void)d; }
void gluTessEndPolygon(GLUtesselator* t) { (void)t; }
void gluTessBeginContour(GLUtesselator* t) { (void)t; }
void gluTessEndContour(GLUtesselator* t) { (void)t; }
void gluTessVertex(GLUtesselator* t, GLdouble* l, void* d) { (void)t; (void)l; (void)d; }
void gluTessNormal(GLUtesselator* t, GLdouble x, GLdouble y, GLdouble z) { (void)t; (void)x; (void)y; (void)z; }
void gluTessCallback(GLUtesselator* t, unsigned int w, _GLUfuncptr f) { (void)t; (void)w; (void)f; }
void gluTessProperty(GLUtesselator* t, unsigned int w, GLdouble v) { (void)t; (void)w; (void)v; }
void gluGetTessProperty(GLUtesselator* t, unsigned int w, GLdouble* d) { (void)t; (void)w; (void)d; }

/* Error string stub */
static const unsigned char glu_error_str[] = "GLU stub error";
const unsigned char* gluErrorString(unsigned int e) { (void)e; return glu_error_str; }
