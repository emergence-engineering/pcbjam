#
# KiCad Wasm Port - OpenCASCADE Find Module Override
#
# When KICAD_USE_OCC=OFF, this module provides stub values
# so the build can proceed without OpenCASCADE.
#

# Check if OCC is disabled
if(DEFINED KICAD_USE_OCC AND NOT KICAD_USE_OCC)
    message(STATUS "OpenCASCADE: DISABLED (KICAD_USE_OCC=OFF)")

    # Set stubs include directory
    set(STUBS_INCLUDE_DIR "${CMAKE_CURRENT_LIST_DIR}/../stubs/include")

    # Set variables that KiCad expects
    set(OCC_FOUND TRUE)
    set(OCC_INCLUDE_DIR "${STUBS_INCLUDE_DIR}")
    set(OCC_INCLUDE_DIRS "${STUBS_INCLUDE_DIR}")
    set(OCC_LIBRARIES "")
    set(OCC_VERSION_STRING "7.5.0")  # Fake version to pass version check
    set(OCC_VERSION_MAJOR 7)
    set(OCC_VERSION_MINOR 5)
    set(OCC_VERSION_PATCH 0)

    # Add stub includes globally
    include_directories("${STUBS_INCLUDE_DIR}")

    return()
endif()

# Otherwise, use the original find module from KiCad
list(REMOVE_ITEM CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")

set(_KICAD_CMAKE_DIR "${CMAKE_SOURCE_DIR}/cmake")
if(EXISTS "${_KICAD_CMAKE_DIR}/FindOCC.cmake")
    include("${_KICAD_CMAKE_DIR}/FindOCC.cmake")
else()
    message(FATAL_ERROR "Cannot find OpenCASCADE find module")
endif()

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")
