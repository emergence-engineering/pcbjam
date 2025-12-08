# FindGLEW.cmake - Stub for WASM builds
# GLEW is not needed for WASM/WebGL builds - OpenGL ES / WebGL is used directly
# Emscripten provides OpenGL ES 2.0/3.0 support through WebGL

if(EMSCRIPTEN)
    message(STATUS "GLEW stubbed for WASM build (using Emscripten WebGL)")

    # Set variables to indicate GLEW is "found" (stubbed)
    set(GLEW_FOUND TRUE)
    set(GLEW_LIBRARY "")
    set(GLEW_LIBRARIES "")
    set(GLEW_INCLUDE_DIR "")
    set(GLEW_INCLUDE_DIRS "")

    # For WASM/WebGL, we use OpenGL ES 2.0 via Emscripten
    # The flags are added in linker options
    # -sUSE_WEBGL2=1 or -sFULL_ES2=1 / -sFULL_ES3=1

    mark_as_advanced(
        GLEW_FOUND
        GLEW_LIBRARY
        GLEW_INCLUDE_DIR
    )
else()
    # For non-WASM builds, use the system FindGLEW
    include(${CMAKE_ROOT}/Modules/FindGLEW.cmake OPTIONAL)
endif()
