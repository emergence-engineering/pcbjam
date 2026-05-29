# Findngspice.cmake - Stub for WASM builds
# ngspice is not available in WASM builds (KICAD_SPICE=OFF)
# We provide stub values so CMake configuration succeeds

if(EMSCRIPTEN OR NOT KICAD_SPICE)
    message(STATUS "ngspice not available for WASM build (using header stub)")

    # Set variables to indicate ngspice is "found" but disabled
    set(ngspice_FOUND TRUE)
    set(NGSPICE_FOUND TRUE)

    # Point at our header-only stub at wasm/stubs/ngspice/sharedspice.h so
    # eeschema's sim/ngspice.{h,cpp} can compile. The library link line stays
    # empty — the simulator frame is never instantiated in WASM.
    set(NGSPICE_INCLUDE_DIR "${CMAKE_CURRENT_LIST_DIR}/../stubs")
    set(NGSPICE_LIBRARY "")
    set(NGSPICE_LIBRARIES "")

    mark_as_advanced(NGSPICE_INCLUDE_DIR NGSPICE_LIBRARY)
else()
    # For non-WASM builds, use the system findngspice
    find_path(NGSPICE_INCLUDE_DIR ngspice/sharedspice.h)
    find_library(NGSPICE_LIBRARY NAMES ngspice)

    include(FindPackageHandleStandardArgs)
    find_package_handle_standard_args(ngspice DEFAULT_MSG NGSPICE_LIBRARY NGSPICE_INCLUDE_DIR)
endif()
