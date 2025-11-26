#
# KiCad Wasm Port - ngspice Find Module Override
#
# When KICAD_USE_NGSPICE=OFF, this module provides stub values
# so the build can proceed without ngspice.
#

# Check if ngspice is disabled
if(DEFINED KICAD_USE_NGSPICE AND NOT KICAD_USE_NGSPICE)
    message(STATUS "ngspice: DISABLED (KICAD_USE_NGSPICE=OFF)")

    # Set stubs include directory
    set(STUBS_INCLUDE_DIR "${CMAKE_CURRENT_LIST_DIR}/../stubs/include")

    # Set variables that KiCad expects
    # ngspice is dynamically loaded via dlopen, so we don't need to link against it.
    # Set library variables to empty to prevent linking.
    set(ngspice_FOUND TRUE)
    set(NGSPICE_FOUND TRUE)
    set(NGSPICE_INCLUDE_DIR "${STUBS_INCLUDE_DIR}")
    set(NGSPICE_INCLUDE_DIRS "${STUBS_INCLUDE_DIR}")
    # Empty library - ngspice is loaded dynamically, not linked
    set(NGSPICE_LIBRARY "" CACHE STRING "ngspice library (disabled)")
    set(NGSPICE_LIBRARIES "")
    set(NGSPICE_VERSION "disabled")
    # NGSPICE_DLL is used by eeschema at runtime, not link time
    set(NGSPICE_DLL "")

    # Add stub includes globally
    include_directories("${STUBS_INCLUDE_DIR}")

    return()
endif()

# Otherwise, use the original find module from KiCad
list(REMOVE_ITEM CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")

set(_KICAD_CMAKE_DIR "${CMAKE_SOURCE_DIR}/cmake")
if(EXISTS "${_KICAD_CMAKE_DIR}/Findngspice.cmake")
    include("${_KICAD_CMAKE_DIR}/Findngspice.cmake")
else()
    # Fallback search
    find_path(NGSPICE_INCLUDE_DIR NAMES ngspice/sharedspice.h)
    find_library(NGSPICE_LIBRARY NAMES ngspice)

    include(FindPackageHandleStandardArgs)
    find_package_handle_standard_args(ngspice DEFAULT_MSG
        NGSPICE_LIBRARY NGSPICE_INCLUDE_DIR)

    set(NGSPICE_LIBRARIES ${NGSPICE_LIBRARY})
    set(NGSPICE_INCLUDE_DIRS ${NGSPICE_INCLUDE_DIR})

    mark_as_advanced(NGSPICE_INCLUDE_DIR NGSPICE_LIBRARY)
endif()

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")
