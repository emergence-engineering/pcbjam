# Findlibgit2.cmake for WASM cross-compilation
# libgit2 headers downloaded via scripts/deps/build-libgit2-headers.sh
# No library - git functionality won't work in browser

# Look for headers in CMAKE_PREFIX_PATH (sysroot)
foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/include/git2.h")
        set(LIBGIT2_INCLUDE_DIR "${_path}/include")
        break()
    endif()
endforeach()

set(LIBGIT2_INCLUDE_DIRS "${LIBGIT2_INCLUDE_DIR}")
set(LIBGIT2_LIBRARY "")  # No actual library - will be stubbed
set(LIBGIT2_LIBRARIES "")
set(LIBGIT2_VERSION "1.7.1")

# Check if headers exist
if(NOT LIBGIT2_INCLUDE_DIR OR NOT EXISTS "${LIBGIT2_INCLUDE_DIR}/git2.h")
    message(FATAL_ERROR "libgit2 headers not found. Run: ./scripts/deps/build-libgit2-headers.sh")
endif()

set(LIBGIT2_FOUND TRUE)

include(FindPackageHandleStandardArgs)
FIND_PACKAGE_HANDLE_STANDARD_ARGS(libgit2
    REQUIRED_VARS LIBGIT2_INCLUDE_DIR
    VERSION_VAR LIBGIT2_VERSION)

mark_as_advanced(LIBGIT2_INCLUDE_DIR LIBGIT2_LIBRARY)

message(STATUS "Using libgit2 stub for WASM build (git features disabled)")
