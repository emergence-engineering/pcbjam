/*
 * gl1_state — the shim's GL 1.x state singleton and capability routing.
 */

#include "gl1_shim.h"

namespace gl1
{

State& S()
{
    static State s;
    return s;
}


bool* ffpCapSlot( GLenum cap )
{
    State& s = S();

    switch( cap )
    {
    case GL_LIGHTING:       return &s.lighting;
    case GL_COLOR_MATERIAL: return &s.colorMaterial;
    case GL_TEXTURE_2D:     return &s.texture2D;
    case GL_NORMALIZE:      return &s.normalizeNormals;
    case GL_ALPHA_TEST:     return &s.alphaTest;
    // Tracked-but-inert: WebGL2 has no equivalent caps and would raise
    // INVALID_ENUM; the suite's goldens are single-sample/aliased anyway.
    case GL_LINE_SMOOTH:    return &s.lineSmooth;
    case GL_POINT_SMOOTH:   return &s.pointSmooth;
    case GL_MULTISAMPLE:    return &s.multisample;
    default:
        if( cap >= GL_LIGHT0 && cap <= GL_LIGHT7 )
            return &s.lightEnabled[cap - GL_LIGHT0];

        return nullptr; // WebGL-native cap: forward
    }
}


void onCapChanged( GLenum cap )
{
    State& s = S();

    switch( cap )
    {
    case GL_LIGHTING:
    case GL_COLOR_MATERIAL:
        s.lightingDirty = true;
        s.miscDirty = true;
        break;

    case GL_TEXTURE_2D:
    case GL_ALPHA_TEST:
        s.miscDirty = true;
        break;

    default:
        if( cap >= GL_LIGHT0 && cap <= GL_LIGHT7 )
            s.lightingDirty = true;
        break;
    }
}


void stateEnable( GLenum cap, bool enable )
{
    if( bool* slot = ffpCapSlot( cap ) )
    {
        if( *slot != enable )
        {
            *slot = enable;
            onCapChanged( cap );
        }

        return;
    }

    if( enable )
        __real_glEnable( cap );
    else
        __real_glDisable( cap );
}


void stateBindTexture( GLenum target, GLuint texture )
{
    if( target == GL_TEXTURE_2D )
        S().boundTexture2D = texture;

    __real_glBindTexture( target, texture );
}


void stateBlendFunc( GLenum sfactor, GLenum dfactor )
{
    __real_glBlendFunc( sfactor, dfactor );
}


void stateLineWidth( GLfloat width )
{
    if( width > 1.0f )
        GL1_WARN_ONCE( "glLineWidth(%g): browsers clamp line width to 1 — lines render thinner "
                       "than native (known WebGL2 limitation)", (double) width );

    S().lineWidth = width;
    __real_glLineWidth( width );
}


void stateAlphaFunc( GLenum func, GLclampf ref )
{
    State& s = S();
    s.alphaFunc = func;
    s.alphaRef = ref;
    s.miscDirty = true;
}


bool attribNormalized( int arrayIndex, GLenum type )
{
    // GL1 fixed-function semantics: integer color components map to [0,1] and
    // integer normals to [-1,1]; float data is used as-is.
    if( type == GL_FLOAT )
        return false;

    return arrayIndex == CA_COLOR || arrayIndex == CA_NORMAL;
}


static GLsizei componentSize( GLenum type )
{
    switch( type )
    {
    case GL_BYTE:
    case GL_UNSIGNED_BYTE:  return 1;
    case GL_SHORT:
    case GL_UNSIGNED_SHORT: return 2;
    case GL_FLOAT:
    default:                return 4;
    }
}


GLsizei attribEffectiveStride( GLint size, GLenum type, GLsizei stride )
{
    return stride != 0 ? stride : size * componentSize( type );
}

} // namespace gl1
