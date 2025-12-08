# FindZSTD.cmake for WASM cross-compilation
# This override is needed because CMake's find_path/find_library fail during cross-compilation

# ZSTD_INCLUDE_DIR and ZSTD_LIBRARY should be passed from the build script
# or we can use CMAKE_PREFIX_PATH/ZSTD_ROOT

if(NOT ZSTD_INCLUDE_DIR)
    find_path(ZSTD_INCLUDE_DIR NAMES zstd.h
        PATHS ${ZSTD_ROOT} ${CMAKE_PREFIX_PATH}
        PATH_SUFFIXES include
        NO_DEFAULT_PATH)
endif()

if(NOT ZSTD_LIBRARY)
    find_library(ZSTD_LIBRARY NAMES zstd libzstd zstd_static
        PATHS ${ZSTD_ROOT} ${CMAKE_PREFIX_PATH}
        PATH_SUFFIXES lib
        NO_DEFAULT_PATH)
endif()

# Fallback: if not found via find_* commands, check if passed directly
if(NOT ZSTD_INCLUDE_DIR AND DEFINED ENV{SYSROOT})
    set(ZSTD_INCLUDE_DIR "$ENV{SYSROOT}/include")
endif()
if(NOT ZSTD_LIBRARY AND DEFINED ENV{SYSROOT})
    set(ZSTD_LIBRARY "$ENV{SYSROOT}/lib/libzstd.a")
endif()

# Verify files exist
if(ZSTD_INCLUDE_DIR AND NOT EXISTS "${ZSTD_INCLUDE_DIR}/zstd.h")
    message(WARNING "ZSTD headers not found at ${ZSTD_INCLUDE_DIR}/zstd.h")
    unset(ZSTD_INCLUDE_DIR)
endif()

if(ZSTD_LIBRARY AND NOT EXISTS "${ZSTD_LIBRARY}")
    message(WARNING "ZSTD library not found at ${ZSTD_LIBRARY}")
    unset(ZSTD_LIBRARY)
endif()

include(FindPackageHandleStandardArgs)
FIND_PACKAGE_HANDLE_STANDARD_ARGS(ZSTD DEFAULT_MSG
    ZSTD_LIBRARY ZSTD_INCLUDE_DIR)

if(ZSTD_FOUND)
    message(STATUS "Found Zstd: ${ZSTD_LIBRARY}")
endif()

mark_as_advanced(ZSTD_INCLUDE_DIR ZSTD_LIBRARY)
