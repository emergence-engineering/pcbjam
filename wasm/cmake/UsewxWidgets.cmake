# UsewxWidgets.cmake - WASM build version
# This file is included after FindwxWidgets to set up wxWidgets for the build

if(wxWidgets_FOUND)
    # Add include directories
    if(wxWidgets_INCLUDE_DIRS)
        include_directories(SYSTEM ${wxWidgets_INCLUDE_DIRS})
    endif()

    # Add library directories
    if(wxWidgets_LIBRARY_DIRS)
        link_directories(${wxWidgets_LIBRARY_DIRS})
    endif()

    # Add definitions
    if(wxWidgets_DEFINITIONS)
        add_definitions(${wxWidgets_DEFINITIONS})
    endif()

    # Add compiler flags
    if(wxWidgets_CXX_FLAGS)
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} ${wxWidgets_CXX_FLAGS}")
    endif()
endif()
