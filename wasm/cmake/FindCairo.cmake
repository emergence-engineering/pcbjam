# FindCairo.cmake for WASM cross-compilation
# Cairo was built via scripts/deps/build-cairo.sh

# Look for Cairo in CMAKE_PREFIX_PATH (sysroot)
foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/include/cairo/cairo.h")
        set(CAIRO_INCLUDE_DIR "${_path}/include/cairo")
        break()
    endif()
endforeach()

foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/lib/libcairo.a")
        set(CAIRO_LIBRARY "${_path}/lib/libcairo.a")
        break()
    endif()
endforeach()

# Verify they exist
if(NOT CAIRO_INCLUDE_DIR OR NOT EXISTS "${CAIRO_INCLUDE_DIR}/cairo.h")
    message(FATAL_ERROR "Cairo headers not found. Run: ./scripts/deps/build-cairo.sh")
endif()

if(NOT CAIRO_LIBRARY OR NOT EXISTS "${CAIRO_LIBRARY}")
    message(FATAL_ERROR "Cairo library not found. Run: ./scripts/deps/build-cairo.sh")
endif()

# Extract version from cairo-version.h
file(STRINGS "${CAIRO_INCLUDE_DIR}/cairo-version.h" _version_lines
    REGEX "#define[ \t]+CAIRO_VERSION_STRING")
if(_version_lines)
    string(REGEX MATCH "\"([0-9]+\\.[0-9]+\\.[0-9]+)\"" _ ${_version_lines})
    set(CAIRO_VERSION "${CMAKE_MATCH_1}")
else()
    set(CAIRO_VERSION "1.18.0")  # Fallback
endif()

# Set output variables
set(CAIRO_FOUND TRUE)
set(CAIRO_INCLUDE_DIRS "${CAIRO_INCLUDE_DIR}")
set(CAIRO_LIBRARIES "${CAIRO_LIBRARY}")

# Cairo depends on pixman, freetype, png, zlib
# Add these dependencies
foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/lib/libpixman-1.a")
        list(APPEND CAIRO_LIBRARIES "${_path}/lib/libpixman-1.a")
        break()
    endif()
endforeach()

foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/lib/libfreetype.a")
        list(APPEND CAIRO_LIBRARIES "${_path}/lib/libfreetype.a")
        break()
    endif()
endforeach()

foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/lib/libpng16.a")
        list(APPEND CAIRO_LIBRARIES "${_path}/lib/libpng16.a")
    elseif(EXISTS "${_path}/lib/libpng.a")
        list(APPEND CAIRO_LIBRARIES "${_path}/lib/libpng.a")
    endif()
endforeach()

include(FindPackageHandleStandardArgs)
FIND_PACKAGE_HANDLE_STANDARD_ARGS(Cairo
    REQUIRED_VARS CAIRO_LIBRARY CAIRO_INCLUDE_DIR
    VERSION_VAR CAIRO_VERSION)

mark_as_advanced(CAIRO_INCLUDE_DIR CAIRO_LIBRARY)

message(STATUS "Found Cairo for WASM: ${CAIRO_LIBRARY}")
