/*
 * gl1_glu — GLU quadrics and gluPerspective.
 *
 * The tessellation follows the SGI GLU reference implementation (the
 * OpenGL Sample Implementation's libutil/quad.c, SGI Free Software License
 * B) restricted to what the renderer uses: GLU_FILL draw style, GLU_SMOOTH
 * normals, GLU_OUTSIDE orientation, no texture coordinates. Apple's GLU —
 * which rendered the native goldens — derives from the same source, so
 * vertex placement (sin/cos phase), emission order and stack/slice loops
 * must match exactly for pixel parity.
 *
 * Geometry is emitted through the shim's public immediate-mode entry points
 * (glBegin/glNormal3f/glVertex3f/glEnd), so quadrics drawn between
 * glNewList/glEndList record into the display list like any other geometry.
 *
 * The GLU *tesselator* (gluNewTess & co, declared in the same
 * wasm/stubs/GL/glu.h) is a separate concern implemented in
 * kicad/libs/kimath/glu_tess/ — not part of this shim.
 */

#include "gl1_shim.h"

#include <cmath>

namespace
{

const double GLU_PI = 3.14159265358979323846;

// SGI's normal3f helper: normalize, then emit.
void emitNormal( float x, float y, float z )
{
    const float mag = std::sqrt( x * x + y * y + z * z );

    if( mag > 0.00001f )
    {
        x /= mag;
        y /= mag;
        z /= mag;
    }

    glNormal3f( x, y, z );
}

} // namespace

extern "C"
{

// Real (heap-allocated) quadric state; only the modes the renderer uses are
// honored — GLU_FILL draw style, GLU_SMOOTH normals, GLU_OUTSIDE orientation.
struct GLUquadric
{
    GLenum drawStyle;
    GLenum normals;
};


GLUquadric* gluNewQuadric( void )
{
    GLUquadric* q = new GLUquadric;
    q->drawStyle = GLU_FILL;
    q->normals = GLU_SMOOTH;
    return q;
}


void gluDeleteQuadric( GLUquadric* q )
{
    delete q;
}


void gluQuadricDrawStyle( GLUquadric* q, GLenum style )
{
    if( !q )
        return;

    if( style != GLU_FILL )
        GL1_WARN_ONCE( "gluQuadricDrawStyle: only GLU_FILL is supported (got 0x%x)", style );

    q->drawStyle = style;
}


void gluQuadricNormals( GLUquadric* q, GLenum normals )
{
    if( !q )
        return;

    if( normals != GLU_SMOOTH )
        GL1_WARN_ONCE( "gluQuadricNormals: only GLU_SMOOTH is supported (got 0x%x)", normals );

    q->normals = normals;
}


void gluCylinder( GLUquadric* q, double base, double top, double height, int slices, int stacks )
{
    (void) q;

    if( slices < 2 || stacks < 1 || height == 0.0 )
        return;

    const float da = (float) ( 2.0 * GLU_PI / slices );
    const float dr = (float) ( ( top - base ) / stacks );
    const float dz = (float) ( height / stacks );
    const float nz = (float) ( ( base - top ) / height ); // combined with (x,y), normalized

    float t = 0.0f;
    float z = 0.0f;
    float r = (float) base;

    for( int j = 0; j < stacks; j++ )
    {
        glBegin( GL_QUAD_STRIP );

        for( int i = 0; i <= slices; i++ )
        {
            // SGI closes the strip with the angle-0 vertex, not slice*da.
            const float a = ( i == slices ) ? 0.0f : (float) i * da;
            const float x = std::sin( a );
            const float y = std::cos( a );

            emitNormal( x, y, nz );
            glVertex3f( x * r, y * r, z );
            emitNormal( x, y, nz );
            glVertex3f( x * ( r + dr ), y * ( r + dr ), z + dz );
        }

        glEnd();

        r += dr;
        t += dz; // (texture t unused; kept for structural parity)
        z += dz;
    }

    (void) t;
}


void gluDisk( GLUquadric* q, double inner, double outer, int slices, int loops )
{
    (void) q;

    if( slices < 2 || loops < 1 )
        return;

    // GLU_OUTSIDE: disk normal is +Z; the innermost ring of a full disk
    // (inner == 0) degenerates its inner vertices at the origin, exactly as
    // the reference implementation renders it.
    glNormal3f( 0.0f, 0.0f, 1.0f );

    const float da = (float) ( 2.0 * GLU_PI / slices );
    const float dr = (float) ( ( outer - inner ) / loops );

    float r1 = (float) inner;

    for( int l = 0; l < loops; l++ )
    {
        const float r2 = r1 + dr;

        glBegin( GL_QUAD_STRIP );

        for( int s = 0; s <= slices; s++ )
        {
            const float a = ( s == slices ) ? 0.0f : (float) s * da;
            const float sa = std::sin( a );
            const float ca = std::cos( a );

            glVertex2f( r2 * sa, r2 * ca );
            glVertex2f( r1 * sa, r1 * ca );
        }

        glEnd();

        r1 = r2;
    }
}


void gluSphere( GLUquadric* q, double radius, int slices, int stacks )
{
    (void) q;

    if( slices < 2 || stacks < 2 )
        return;

    const float drho = (float) ( GLU_PI / stacks );
    const float dtheta = (float) ( 2.0 * GLU_PI / slices );
    const float rad = (float) radius;

    // +Z pole cap (triangle fan).
    glBegin( GL_TRIANGLE_FAN );
    glNormal3f( 0.0f, 0.0f, 1.0f );
    glVertex3f( 0.0f, 0.0f, rad );

    for( int j = 0; j <= slices; j++ )
    {
        const float theta = ( j == slices ) ? 0.0f : (float) j * dtheta;
        const float x = -std::sin( theta ) * std::sin( drho );
        const float y = std::cos( theta ) * std::sin( drho );
        const float z = std::cos( drho );

        glNormal3f( x, y, z );
        glVertex3f( x * rad, y * rad, z * rad );
    }

    glEnd();

    // Intermediate stacks as quad strips.
    for( int i = 1; i < stacks - 1; i++ )
    {
        const float rho = (float) i * drho;

        glBegin( GL_QUAD_STRIP );

        for( int j = 0; j <= slices; j++ )
        {
            const float theta = ( j == slices ) ? 0.0f : (float) j * dtheta;

            float x = -std::sin( theta ) * std::sin( rho );
            float y = std::cos( theta ) * std::sin( rho );
            float z = std::cos( rho );

            glNormal3f( x, y, z );
            glVertex3f( x * rad, y * rad, z * rad );

            x = -std::sin( theta ) * std::sin( rho + drho );
            y = std::cos( theta ) * std::sin( rho + drho );
            z = std::cos( rho + drho );

            glNormal3f( x, y, z );
            glVertex3f( x * rad, y * rad, z * rad );
        }

        glEnd();
    }

    // -Z pole cap (triangle fan, reverse slice order).
    glBegin( GL_TRIANGLE_FAN );
    glNormal3f( 0.0f, 0.0f, -1.0f );
    glVertex3f( 0.0f, 0.0f, -rad );

    const float rho = (float) GLU_PI - drho;

    for( int j = slices; j >= 0; j-- )
    {
        const float theta = ( j == slices ) ? 0.0f : (float) j * dtheta;
        const float x = -std::sin( theta ) * std::sin( rho );
        const float y = std::cos( theta ) * std::sin( rho );
        const float z = std::cos( rho );

        glNormal3f( x, y, z );
        glVertex3f( x * rad, y * rad, z * rad );
    }

    glEnd();
}


void gluPerspective( double fovy, double aspect, double zNear, double zFar )
{
    gl1::matrixPerspective( fovy, aspect, zNear, zFar );
}

} // extern "C"
