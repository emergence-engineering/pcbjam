#
# KiCad WebAssembly Port - Root Build Configuration
#
# This is a wrapper CMakeLists.txt that configures optional dependencies
# before building KiCad. Use this for building with features disabled.
#
# Usage:
#   mkdir build && cd build
#   cmake .. -DKICAD_USE_CURL=OFF -DKICAD_USE_GIT=OFF -DKICAD_USE_OCC=OFF
#   make -j$(nproc)
#

cmake_minimum_required(VERSION 3.22)
project(kicad-wasm-wrapper)

# Add our stubs to the include path when dependencies are disabled
set(KICAD_WASM_STUBS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/stubs/include")

# Include our options module
include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/KicadWasmOptions.cmake")

# Add stubs to include path when features are disabled
if(NOT KICAD_USE_CURL OR NOT KICAD_USE_GIT)
    message(STATUS "Adding stub headers to include path: ${KICAD_WASM_STUBS_DIR}")
    include_directories(BEFORE SYSTEM "${KICAD_WASM_STUBS_DIR}")
endif()

# For now, we need to build KiCad from its directory directly
# because it expects to be the root project.
#
# This wrapper is mainly for documentation and can be extended later.
message(STATUS "")
message(STATUS "=== KiCad Wasm Build Configuration ===")
message(STATUS "")
message(STATUS "Note: KiCad must be built from its source directory.")
message(STATUS "")
message(STATUS "To build with features disabled, use:")
message(STATUS "")
message(STATUS "  cd kicad")
message(STATUS "  mkdir build && cd build")
message(STATUS "  cmake .. \\")
message(STATUS "    -DCMAKE_MODULE_PATH=${CMAKE_CURRENT_SOURCE_DIR}/cmake \\")
message(STATUS "    -DKICAD_USE_CURL=${KICAD_USE_CURL} \\")
message(STATUS "    -DKICAD_USE_GIT=${KICAD_USE_GIT} \\")
message(STATUS "    -DKICAD_USE_OCC=${KICAD_USE_OCC} \\")
message(STATUS "    -DKICAD_USE_NGSPICE=${KICAD_USE_NGSPICE}")
message(STATUS "")
message(STATUS "Or use the helper script:")
message(STATUS "  ./scripts/build.sh")
message(STATUS "")
message(FATAL_ERROR "Please build from kicad/ directory as described above")
