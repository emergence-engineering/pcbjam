# FindGLM.cmake for WASM cross-compilation
# This override is needed because CMake's find_file fails during cross-compilation
# GLM is a header-only library at ${GLM_INCLUDE_DIR}/glm/

# GLM_INCLUDE_DIR should be passed from the build script
if(NOT GLM_INCLUDE_DIR)
    message(FATAL_ERROR "GLM_INCLUDE_DIR must be set for WASM builds")
endif()

# Verify the headers exist
if(NOT EXISTS "${GLM_INCLUDE_DIR}/glm/glm.hpp")
    message(FATAL_ERROR "GLM headers not found at ${GLM_INCLUDE_DIR}/glm/glm.hpp")
endif()

# Extract version from setup.hpp
file(STRINGS "${GLM_INCLUDE_DIR}/glm/detail/setup.hpp" _glm_version_lines
    REGEX "^#define[ \t]+GLM_VERSION_(MAJOR|MINOR|PATCH|REVISION)[ \t]+[0-9]+")

foreach(_line ${_glm_version_lines})
    if(_line MATCHES "GLM_VERSION_MAJOR[ \t]+([0-9]+)")
        set(_GLM_VERSION_MAJOR ${CMAKE_MATCH_1})
    elseif(_line MATCHES "GLM_VERSION_MINOR[ \t]+([0-9]+)")
        set(_GLM_VERSION_MINOR ${CMAKE_MATCH_1})
    elseif(_line MATCHES "GLM_VERSION_PATCH[ \t]+([0-9]+)")
        set(_GLM_VERSION_PATCH ${CMAKE_MATCH_1})
    elseif(_line MATCHES "GLM_VERSION_REVISION[ \t]+([0-9]+)")
        set(_GLM_VERSION_REVISION ${CMAKE_MATCH_1})
    endif()
endforeach()

set(GLM_VERSION "${_GLM_VERSION_MAJOR}.${_GLM_VERSION_MINOR}.${_GLM_VERSION_PATCH}.${_GLM_VERSION_REVISION}")

include(FindPackageHandleStandardArgs)
FIND_PACKAGE_HANDLE_STANDARD_ARGS(GLM
    REQUIRED_VARS
        GLM_INCLUDE_DIR
        GLM_VERSION
    VERSION_VAR GLM_VERSION)

mark_as_advanced(GLM_INCLUDE_DIR)
set(GLM_VERSION_MAJOR ${_GLM_VERSION_MAJOR} CACHE INTERNAL "")
set(GLM_VERSION_MINOR ${_GLM_VERSION_MINOR} CACHE INTERNAL "")
set(GLM_VERSION_PATCH ${_GLM_VERSION_PATCH} CACHE INTERNAL "")
set(GLM_VERSION_TWEAK ${_GLM_VERSION_REVISION} CACHE INTERNAL "")
