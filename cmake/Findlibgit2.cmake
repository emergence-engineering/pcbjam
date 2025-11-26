#
# KiCad Wasm Port - libgit2 Find Module Override
#
# When KICAD_USE_GIT=OFF, this module provides stub values
# so the build can proceed without libgit2.
#

# Check if git is disabled
if(DEFINED KICAD_USE_GIT AND NOT KICAD_USE_GIT)
    message(STATUS "libgit2: DISABLED (KICAD_USE_GIT=OFF)")

    # Set variables that KiCad expects
    set(LIBGIT2_FOUND TRUE)
    set(LIBGIT2_INCLUDE_DIR "")
    set(LIBGIT2_INCLUDE_DIRS "")
    set(LIBGIT2_LIBRARIES "")
    set(LIBGIT2_DEFINITIONS "")
    set(LIBGIT2_VERSION_STRING "stub")

    # Mark as found
    set(libgit2_FOUND TRUE)

    return()
endif()

# Otherwise, use the original find module from KiCad
# First, remove our cmake dir from the module path to avoid recursion
list(REMOVE_ITEM CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")

# Look for the original module in KiCad's cmake dir
set(_KICAD_CMAKE_DIR "${CMAKE_SOURCE_DIR}/cmake")
if(EXISTS "${_KICAD_CMAKE_DIR}/Findlibgit2.cmake")
    include("${_KICAD_CMAKE_DIR}/Findlibgit2.cmake")
else()
    # Fallback: Use pkg-config
    find_package(PkgConfig)
    pkg_search_module(PC_LIBGIT2 libgit2)

    set(LIBGIT2_DEFINITIONS ${PC_LIBGIT2_CFLAGS_OTHER})

    find_path(LIBGIT2_INCLUDE_DIR NAMES git2.h
        HINTS
        ${PC_LIBGIT2_INCLUDEDIR}
        ${PC_LIBGIT2_INCLUDE_DIRS}
    )

    find_library(LIBGIT2_LIBRARY NAMES git2
        HINTS
        ${PC_LIBGIT2_LIBDIR}
        ${PC_LIBGIT2_LIBRARY_DIRS}
    )

    set(LIBGIT2_LIBRARIES ${LIBGIT2_LIBRARY})
    set(LIBGIT2_INCLUDE_DIRS ${LIBGIT2_INCLUDE_DIR})

    include(FindPackageHandleStandardArgs)
    find_package_handle_standard_args(libgit2 DEFAULT_MSG
        LIBGIT2_LIBRARY LIBGIT2_INCLUDE_DIR)

    mark_as_advanced(LIBGIT2_INCLUDE_DIR LIBGIT2_LIBRARY)
endif()

# Restore module path
list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}")
