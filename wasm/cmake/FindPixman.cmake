# FindPixman.cmake for WASM cross-compilation
# Pixman was built via scripts/deps/build-pixman.sh

# Look for Pixman in CMAKE_PREFIX_PATH (sysroot)
foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/include/pixman-1/pixman.h")
        set(PIXMAN_INCLUDE_DIR "${_path}/include/pixman-1")
        break()
    endif()
endforeach()

foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/lib/libpixman-1.a")
        set(PIXMAN_LIBRARY "${_path}/lib/libpixman-1.a")
        break()
    endif()
endforeach()

# Verify they exist
if(NOT PIXMAN_INCLUDE_DIR OR NOT EXISTS "${PIXMAN_INCLUDE_DIR}/pixman.h")
    message(FATAL_ERROR "Pixman headers not found. Run: ./scripts/deps/build-pixman.sh")
endif()

if(NOT PIXMAN_LIBRARY OR NOT EXISTS "${PIXMAN_LIBRARY}")
    message(FATAL_ERROR "Pixman library not found. Run: ./scripts/deps/build-pixman.sh")
endif()

# Extract version from pixman-version.h
file(STRINGS "${PIXMAN_INCLUDE_DIR}/pixman-version.h" _version_major
    REGEX "#define[ \t]+PIXMAN_VERSION_MAJOR")
file(STRINGS "${PIXMAN_INCLUDE_DIR}/pixman-version.h" _version_minor
    REGEX "#define[ \t]+PIXMAN_VERSION_MINOR")
file(STRINGS "${PIXMAN_INCLUDE_DIR}/pixman-version.h" _version_micro
    REGEX "#define[ \t]+PIXMAN_VERSION_MICRO")

if(_version_major AND _version_minor AND _version_micro)
    string(REGEX MATCH "[0-9]+" _major ${_version_major})
    string(REGEX MATCH "[0-9]+" _minor ${_version_minor})
    string(REGEX MATCH "[0-9]+" _micro ${_version_micro})
    set(PIXMAN_VERSION "${_major}.${_minor}.${_micro}")
else()
    set(PIXMAN_VERSION "0.42.2")  # Fallback
endif()

# Set output variables
set(PIXMAN_FOUND TRUE)
set(PIXMAN_INCLUDE_DIRS "${PIXMAN_INCLUDE_DIR}")
set(PIXMAN_LIBRARIES "${PIXMAN_LIBRARY}")

include(FindPackageHandleStandardArgs)
FIND_PACKAGE_HANDLE_STANDARD_ARGS(Pixman
    REQUIRED_VARS PIXMAN_LIBRARY PIXMAN_INCLUDE_DIR
    VERSION_VAR PIXMAN_VERSION)

mark_as_advanced(PIXMAN_INCLUDE_DIR PIXMAN_LIBRARY)

message(STATUS "Found Pixman for WASM: ${PIXMAN_LIBRARY}")
