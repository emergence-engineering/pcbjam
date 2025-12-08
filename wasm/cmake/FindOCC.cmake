# FindOCC.cmake - Find OpenCASCADE for WASM builds
# Uses our pre-built OpenCASCADE from the sysroot

if(EMSCRIPTEN)
    # For WASM builds, use our built OpenCASCADE
    set(OCC_INCLUDE_DIR "${SYSROOT}/include/opencascade")
    set(OCC_LIBRARY_DIR "${SYSROOT}/lib")

    # Find all OCC libraries
    file(GLOB OCC_LIBRARIES "${SYSROOT}/lib/libTK*.a")

    if(EXISTS "${OCC_INCLUDE_DIR}" AND OCC_LIBRARIES)
        set(OCC_FOUND TRUE)
        set(OpenCASCADE_FOUND TRUE)
        # Version from Standard_Version.hxx
        set(OCC_VERSION_STRING "7.8.0")
        message(STATUS "Found OpenCASCADE ${OCC_VERSION_STRING} for WASM: ${OCC_INCLUDE_DIR}")
    else()
        set(OCC_FOUND FALSE)
        message(FATAL_ERROR "OpenCASCADE not found in sysroot. Run: ./scripts/deps/build-opencascade.sh")
    endif()

    mark_as_advanced(OCC_INCLUDE_DIR OCC_LIBRARIES OCC_LIBRARY_DIR)
else()
    # For non-WASM builds, use the original FindOCC
    # This should not be reached for WASM builds
endif()
