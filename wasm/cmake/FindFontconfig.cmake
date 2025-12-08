# FindFontconfig.cmake - Stub for WASM builds
# Fontconfig is not available in WASM - system fonts are not accessible from browser
# We provide stub values so CMake configuration succeeds

if(EMSCRIPTEN)
    message(STATUS "Fontconfig not available for WASM build (system fonts not accessible in browser)")

    # Set variables to indicate Fontconfig is "found" but disabled
    set(Fontconfig_FOUND TRUE)
    set(FONTCONFIG_FOUND TRUE)

    # Provide empty values - actual code should be conditionally compiled
    set(Fontconfig_INCLUDE_DIR "")
    set(Fontconfig_LIBRARY "")
    set(Fontconfig_LIBRARIES "")
    set(FONTCONFIG_INCLUDE_DIR "")
    set(FONTCONFIG_LIBRARY "")
    set(FONTCONFIG_LIBRARIES "")

    # Create an imported target
    if(NOT TARGET Fontconfig::Fontconfig)
        add_library(Fontconfig::Fontconfig INTERFACE IMPORTED)
    endif()

    mark_as_advanced(Fontconfig_INCLUDE_DIR Fontconfig_LIBRARY)
else()
    # For non-WASM builds, use the system FindFontconfig
    include(${CMAKE_ROOT}/Modules/FindFontconfig.cmake OPTIONAL)
endif()
