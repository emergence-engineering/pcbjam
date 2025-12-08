# FindwxWidgets.cmake - WASM build version
# Uses wx-config to find wxWidgets for WASM cross-compilation

if(EMSCRIPTEN AND wxWidgets_CONFIG_EXECUTABLE)
    message(STATUS "Finding wxWidgets using wx-config for WASM...")

    # Get version
    execute_process(
        COMMAND "${wxWidgets_CONFIG_EXECUTABLE}" --version
        OUTPUT_VARIABLE wxWidgets_VERSION_STRING
        OUTPUT_STRIP_TRAILING_WHITESPACE
        RESULT_VARIABLE RET
    )
    if(NOT RET EQUAL 0)
        message(FATAL_ERROR "wx-config --version failed")
    endif()

    # Parse version
    string(REGEX MATCH "^([0-9]+)\\.([0-9]+)\\.([0-9]+)" _match "${wxWidgets_VERSION_STRING}")
    set(wxWidgets_VERSION_MAJOR "${CMAKE_MATCH_1}")
    set(wxWidgets_VERSION_MINOR "${CMAKE_MATCH_2}")
    set(wxWidgets_VERSION_PATCH "${CMAKE_MATCH_3}")

    # Get include directories
    execute_process(
        COMMAND "${wxWidgets_CONFIG_EXECUTABLE}" --cxxflags
        OUTPUT_VARIABLE wxWidgets_CXX_FLAGS
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    # Extract include directories from cxxflags
    string(REGEX MATCHALL "-I[^ ]+" _includes "${wxWidgets_CXX_FLAGS}")
    set(wxWidgets_INCLUDE_DIRS "")
    foreach(_inc ${_includes})
        string(REGEX REPLACE "^-I" "" _dir "${_inc}")
        list(APPEND wxWidgets_INCLUDE_DIRS "${_dir}")
    endforeach()

    # Get libraries
    execute_process(
        COMMAND "${wxWidgets_CONFIG_EXECUTABLE}" --libs all
        OUTPUT_VARIABLE _wx_libs_output
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )

    # Parse libraries
    set(wxWidgets_LIBRARIES "")
    set(wxWidgets_LIBRARY_DIRS "")

    # Split into list
    string(REPLACE " " ";" _wx_libs_list "${_wx_libs_output}")

    foreach(_item ${_wx_libs_list})
        if(_item MATCHES "^-L(.+)")
            list(APPEND wxWidgets_LIBRARY_DIRS "${CMAKE_MATCH_1}")
        elseif(_item MATCHES "^-l(.+)")
            list(APPEND wxWidgets_LIBRARIES "${CMAKE_MATCH_1}")
        elseif(_item MATCHES "\\.a$")
            # Full path to static library
            list(APPEND wxWidgets_LIBRARIES "${_item}")
        elseif(_item MATCHES "^-s(.+)")
            # Emscripten linker flags like -sUSE_LIBPNG=1
            list(APPEND wxWidgets_LIBRARIES "${_item}")
        elseif(_item MATCHES "^-pthread")
            # Pthread flag
            list(APPEND wxWidgets_LIBRARIES "-pthread")
        endif()
    endforeach()

    # Get the wxWidgets root directory
    get_filename_component(wxWidgets_ROOT_DIR "${wxWidgets_CONFIG_EXECUTABLE}" DIRECTORY)

    # Set the wx configuration for port detection
    # For WASM, we use our own port implementation
    set(_wx_selected_config "wasm-wasmuniv-unicode-static-3.2" CACHE INTERNAL "")
    set(wxWidgets_FIND_STYLE "unix" CACHE INTERNAL "")

    # Set KICAD_WX_PORT to "wasm" - kiplatform will need our custom source files
    set(KICAD_WX_PORT "wasm" CACHE STRING "wxWidgets port for WASM" FORCE)

    # Pre-set PLATFORM_SRCS with our WASM implementation
    # This will be used by kiplatform if it doesn't recognize the port
    set(KIPLATFORM_WASM_SRCS "${SYSROOT}/../../../wasm/kiplatform/ui.cpp" CACHE PATH "WASM kiplatform sources")

    # Get definitions
    execute_process(
        COMMAND "${wxWidgets_CONFIG_EXECUTABLE}" --cppflags
        OUTPUT_VARIABLE _wx_cpp_flags
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    string(REGEX MATCHALL "-D[^ ]+" wxWidgets_DEFINITIONS "${_wx_cpp_flags}")

    # Set found
    set(wxWidgets_FOUND TRUE)

    # Create the use file path
    set(wxWidgets_USE_FILE "${CMAKE_CURRENT_LIST_DIR}/UsewxWidgets.cmake")

    message(STATUS "Found wxWidgets ${wxWidgets_VERSION_STRING} for WASM")
    message(STATUS "  Include dirs: ${wxWidgets_INCLUDE_DIRS}")
    message(STATUS "  Library dirs: ${wxWidgets_LIBRARY_DIRS}")

    include(FindPackageHandleStandardArgs)
    find_package_handle_standard_args(wxWidgets
        REQUIRED_VARS wxWidgets_LIBRARIES wxWidgets_INCLUDE_DIRS
        VERSION_VAR wxWidgets_VERSION_STRING
    )

else()
    # For non-WASM builds, use the standard FindwxWidgets
    include(${CMAKE_ROOT}/Modules/FindwxWidgets.cmake OPTIONAL)
endif()
