#
# KiCad WebAssembly Port - Optional Dependency Configuration
#
# This module defines options to disable optional dependencies for Wasm builds.
# Include this BEFORE processing KiCad's CMakeLists.txt
#

# Optional dependency flags
option( KICAD_USE_CURL "Enable network features (curl)" ON )
option( KICAD_USE_GIT "Enable git integration (libgit2)" ON )
option( KICAD_USE_OCC "Enable STEP/3D via OpenCASCADE" ON )
option( KICAD_USE_NGSPICE "Enable SPICE simulation" ON )
option( KICAD_USE_DATABASE "Enable database libraries (ODBC)" ON )

# When building for Wasm, disable all optional deps by default
option( KICAD_WASM_BUILD "Building for WebAssembly target" OFF )

if( KICAD_WASM_BUILD )
    message( STATUS "KiCad Wasm build: Disabling optional dependencies" )
    set( KICAD_USE_CURL OFF CACHE BOOL "" FORCE )
    set( KICAD_USE_GIT OFF CACHE BOOL "" FORCE )
    set( KICAD_USE_OCC OFF CACHE BOOL "" FORCE )
    set( KICAD_USE_NGSPICE OFF CACHE BOOL "" FORCE )
    set( KICAD_USE_DATABASE OFF CACHE BOOL "" FORCE )
endif()

# Report status
message( STATUS "KICAD_USE_CURL: ${KICAD_USE_CURL}" )
message( STATUS "KICAD_USE_GIT: ${KICAD_USE_GIT}" )
message( STATUS "KICAD_USE_OCC: ${KICAD_USE_OCC}" )
message( STATUS "KICAD_USE_NGSPICE: ${KICAD_USE_NGSPICE}" )
message( STATUS "KICAD_USE_DATABASE: ${KICAD_USE_DATABASE}" )

#
# Create stub/dummy targets for disabled dependencies
#

# CURL stub
if( NOT KICAD_USE_CURL )
    if( NOT TARGET CURL::libcurl )
        add_library( CURL::libcurl INTERFACE IMPORTED )
    endif()
    add_compile_definitions( KICAD_USE_CURL=0 )
else()
    add_compile_definitions( KICAD_USE_CURL=1 )
endif()

# libgit2 stub
if( NOT KICAD_USE_GIT )
    set( LIBGIT2_FOUND TRUE )
    set( LIBGIT2_LIBRARIES "" )
    set( LIBGIT2_INCLUDE_DIRS "" )
    add_compile_definitions( KICAD_USE_GIT=0 )
else()
    add_compile_definitions( KICAD_USE_GIT=1 )
endif()

# OpenCASCADE stub
if( NOT KICAD_USE_OCC )
    set( OCC_FOUND TRUE )
    set( OCC_VERSION_STRING "7.5.0" )
    set( OCC_INCLUDE_DIR "" )
    set( OCC_LIBRARIES "" )
    add_compile_definitions( KICAD_USE_OCC=0 )
else()
    add_compile_definitions( KICAD_USE_OCC=1 )
endif()

# ngspice stub
if( NOT KICAD_USE_NGSPICE )
    set( ngspice_FOUND TRUE )
    set( NGSPICE_LIBRARY "" )
    set( NGSPICE_INCLUDE_DIR "" )
    add_compile_definitions( KICAD_USE_NGSPICE=0 )
else()
    add_compile_definitions( KICAD_USE_NGSPICE=1 )
endif()

# Database (ODBC) - affects boost::locale requirement
if( NOT KICAD_USE_DATABASE )
    add_compile_definitions( KICAD_USE_DATABASE=0 )
else()
    add_compile_definitions( KICAD_USE_DATABASE=1 )
endif()
