# FindPythonLibs.cmake - Stub for WASM builds
# Python libraries are not available/needed for WASM builds (no Python scripting)
# We provide stub values so CMake configuration succeeds

if(EMSCRIPTEN)
    message(STATUS "Python libraries stubbed for WASM build (Python scripting disabled)")

    # Find the Python interpreter first (we need it for some build scripts)
    find_program(PYTHON_EXECUTABLE NAMES python3 python)

    if(PYTHON_EXECUTABLE)
        # Get Python version
        execute_process(
            COMMAND "${PYTHON_EXECUTABLE}" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
            OUTPUT_VARIABLE PYTHON_VERSION_STRING
            OUTPUT_STRIP_TRAILING_WHITESPACE
        )
        string(REPLACE "." ";" VERSION_LIST "${PYTHON_VERSION_STRING}")
        list(GET VERSION_LIST 0 PYTHON_VERSION_MAJOR)
        list(GET VERSION_LIST 1 PYTHON_VERSION_MINOR)
    else()
        set(PYTHON_VERSION_MAJOR "3")
        set(PYTHON_VERSION_MINOR "10")
        set(PYTHON_VERSION_STRING "3.10")
    endif()

    # Set variables to indicate PythonLibs is "found" (stubbed)
    set(PYTHONLIBS_FOUND TRUE)
    set(PythonLibs_FOUND TRUE)

    # Provide stub values - the actual libraries won't be linked
    set(PYTHON_LIBRARIES "")
    set(PYTHON_INCLUDE_DIRS "/usr/include/python${PYTHON_VERSION_STRING}")
    set(PYTHON_INCLUDE_DIR "${PYTHON_INCLUDE_DIRS}")
    set(PYTHON_LIBRARY "")

    mark_as_advanced(
        PYTHON_LIBRARIES
        PYTHON_INCLUDE_DIRS
        PYTHON_LIBRARY
    )
else()
    # For non-WASM builds, use the system FindPythonLibs
    include(${CMAKE_ROOT}/Modules/FindPythonLibs.cmake OPTIONAL)
endif()
