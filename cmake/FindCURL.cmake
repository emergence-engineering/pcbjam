#
# KiCad Wasm Port - CURL Find Module Override
#
# When KICAD_USE_CURL=OFF, this module provides stub values
# so the build can proceed without libcurl.
#

# Check if curl is disabled
if(DEFINED KICAD_USE_CURL AND NOT KICAD_USE_CURL)
    message(STATUS "CURL: DISABLED (KICAD_USE_CURL=OFF)")

    # Set variables that KiCad expects
    set(CURL_FOUND TRUE)
    set(CURL_INCLUDE_DIRS "")
    set(CURL_LIBRARIES "")
    set(CURL_VERSION_STRING "stub")

    # Create an imported target that does nothing
    if(NOT TARGET CURL::libcurl)
        add_library(CURL::libcurl INTERFACE IMPORTED)
    endif()

    return()
endif()

# Otherwise, use CMake's built-in FindCURL
# Remove our path to avoid recursion
list(REMOVE_ITEM CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")

# Use built-in module
include(${CMAKE_ROOT}/Modules/FindCURL.cmake)

# Restore module path
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")
