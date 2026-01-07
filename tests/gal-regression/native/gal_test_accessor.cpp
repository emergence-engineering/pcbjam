/**
 * GAL Test Accessor Implementation
 *
 * Uses a member pointer technique to access private members without
 * the #define private public hack that breaks standard library headers.
 */

#include "gal_test_accessor.h"
#include "kicad_stubs.h"

#include <gal/opengl/opengl_gal.h>
#include <gal/opengl/opengl_compositor.h>

// Template-based private member accessor trick
// See: https://bloglitb.blogspot.com/2010/07/access-to-private-members-thats-easy.html

template<typename Tag>
struct result {
    typedef typename Tag::type type;
    static type ptr;
};

template<typename Tag>
typename result<Tag>::type result<Tag>::ptr;

template<typename Tag, typename Tag::type p>
struct rob : result<Tag> {
    struct filler {
        filler() { result<Tag>::ptr = p; }
    };
    static filler filler_obj;
};

template<typename Tag, typename Tag::type p>
typename rob<Tag, p>::filler rob<Tag, p>::filler_obj;

// Tags for the private members we need to access
struct OPENGL_GAL_compositor { typedef KIGFX::OPENGL_COMPOSITOR* KIGFX::OPENGL_GAL::*type; };
struct OPENGL_GAL_mainBuffer { typedef unsigned int KIGFX::OPENGL_GAL::*type; };
struct OPENGL_COMPOSITOR_mainFbo { typedef GLuint KIGFX::OPENGL_COMPOSITOR::*type; };

// Instantiate the accessors
template struct rob<OPENGL_GAL_compositor, &KIGFX::OPENGL_GAL::m_compositor>;
template struct rob<OPENGL_GAL_mainBuffer, &KIGFX::OPENGL_GAL::m_mainBuffer>;
template struct rob<OPENGL_COMPOSITOR_mainFbo, &KIGFX::OPENGL_COMPOSITOR::m_mainFbo>;

GLuint GetCompositorMainBufferTexture(KIGFX::OPENGL_GAL* gal) {
    // Get the compositor pointer using the member pointer accessor
    KIGFX::OPENGL_COMPOSITOR* compositor = gal->*result<OPENGL_GAL_compositor>::ptr;
    unsigned int mainBuffer = gal->*result<OPENGL_GAL_mainBuffer>::ptr;

    if (compositor && mainBuffer > 0) {
        return compositor->GetBufferTexture(mainBuffer);
    }
    return 0;
}

void GetCompositorBufferSize(KIGFX::OPENGL_GAL* gal, int* width, int* height) {
    KIGFX::OPENGL_COMPOSITOR* compositor = gal->*result<OPENGL_GAL_compositor>::ptr;

    if (compositor) {
        VECTOR2I size = compositor->GetScreenSize();
        *width = size.x;
        *height = size.y;
    } else {
        *width = 0;
        *height = 0;
    }
}

GLuint GetCompositorMainFBO(KIGFX::OPENGL_GAL* gal) {
    KIGFX::OPENGL_COMPOSITOR* compositor = gal->*result<OPENGL_GAL_compositor>::ptr;
    if (compositor) {
        return compositor->*result<OPENGL_COMPOSITOR_mainFbo>::ptr;
    }
    return 0;
}

unsigned int GetMainBufferHandle(KIGFX::OPENGL_GAL* gal) {
    return gal->*result<OPENGL_GAL_mainBuffer>::ptr;
}

bool ReadCompositorFBOPixels(KIGFX::OPENGL_GAL* gal, std::vector<uint8_t>& pixels, int* width, int* height) {
    KIGFX::OPENGL_COMPOSITOR* compositor = gal->*result<OPENGL_GAL_compositor>::ptr;
    unsigned int mainBuffer = gal->*result<OPENGL_GAL_mainBuffer>::ptr;

    if (!compositor || mainBuffer == 0) {
        return false;
    }

    GLuint mainFbo = compositor->*result<OPENGL_COMPOSITOR_mainFbo>::ptr;

    // Get size from compositor
    VECTOR2I size = compositor->GetScreenSize();
    *width = size.x;
    *height = size.y;

    // Compute attachment point: GL_COLOR_ATTACHMENT0 + (mainBuffer - 1)
    GLenum attachmentPoint = GL_COLOR_ATTACHMENT0_EXT + (mainBuffer - 1);

    // Bind the FBO for reading
    glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, mainFbo);
    glReadBuffer(attachmentPoint);

    // Read pixels
    pixels.resize((*width) * (*height) * 4);
    glReadPixels(0, 0, *width, *height, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

    // Unbind FBO
    glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, 0);

    return true;
}
