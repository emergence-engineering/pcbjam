# FindCURL.cmake for WASM cross-compilation
# This provides stub CURL support for KiCad WASM builds
# Real CURL functionality is not needed in the browser - networking
# would use fetch API if needed
#
# Headers are downloaded via scripts/deps/build-curl-headers.sh
# No library is linked - CURL functions will be stubbed

# Look for headers in sysroot - CMAKE_PREFIX_PATH contains sysroot path
# We check each path in CMAKE_PREFIX_PATH for curl headers
foreach(_path ${CMAKE_PREFIX_PATH})
    if(EXISTS "${_path}/include/curl/curl.h")
        set(CURL_INCLUDE_DIR "${_path}/include")
        break()
    endif()
endforeach()

# Verify headers exist
if(NOT CURL_INCLUDE_DIR OR NOT EXISTS "${CURL_INCLUDE_DIR}/curl/curl.h")
    message(FATAL_ERROR "CURL headers not found at ${CMAKE_PREFIX_PATH}. Run: ./scripts/deps/build-curl-headers.sh")
endif()

# Create a dummy library target
if(NOT TARGET CURL::libcurl)
    add_library(CURL::libcurl INTERFACE IMPORTED)
    set_target_properties(CURL::libcurl PROPERTIES
        INTERFACE_INCLUDE_DIRECTORIES "${CURL_INCLUDE_DIR}")
endif()

# Set the required variables
set(CURL_FOUND TRUE)
set(CURL_INCLUDE_DIRS "${CURL_INCLUDE_DIR}")
set(CURL_LIBRARY "")  # No actual library - will be stubbed
set(CURL_LIBRARIES "")
set(CURL_VERSION_STRING "8.5.0-wasm-stub")

# Mark as advanced
mark_as_advanced(CURL_INCLUDE_DIR CURL_LIBRARY)

message(STATUS "Using CURL headers for WASM build: ${CURL_INCLUDE_DIR}")
