/**
 * GAL Test Accessor
 *
 * Provides access to OPENGL_GAL internal members for testing purposes.
 * This uses a technique to access private members without modifying KiCad headers.
 */

#ifndef GAL_TEST_ACCESSOR_H
#define GAL_TEST_ACCESSOR_H

#include <GL/glew.h>
#include <vector>

// Forward declarations
namespace KIGFX {
    class OPENGL_GAL;
    class OPENGL_COMPOSITOR;
}

// Test accessor functions - implemented in gal_test_accessor.cpp
GLuint GetCompositorMainBufferTexture(KIGFX::OPENGL_GAL* gal);
void GetCompositorBufferSize(KIGFX::OPENGL_GAL* gal, int* width, int* height);
GLuint GetCompositorMainFBO(KIGFX::OPENGL_GAL* gal);
unsigned int GetMainBufferHandle(KIGFX::OPENGL_GAL* gal);

// Read pixels directly from the compositor's FBO
bool ReadCompositorFBOPixels(KIGFX::OPENGL_GAL* gal, std::vector<uint8_t>& pixels, int* width, int* height);

#endif // GAL_TEST_ACCESSOR_H
