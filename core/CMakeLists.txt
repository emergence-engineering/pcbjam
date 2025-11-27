cmake_minimum_required(VERSION 3.16)
project(kicad_core VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Path to KiCad source (submodule)
set(KICAD_SOURCE "${CMAKE_SOURCE_DIR}/../kicad" CACHE PATH "Path to KiCad source")

# Verify KiCad source exists
if(NOT EXISTS "${KICAD_SOURCE}/libs/kimath")
    message(FATAL_ERROR "KiCad source not found at ${KICAD_SOURCE}")
endif()

message(STATUS "Using KiCad source at: ${KICAD_SOURCE}")

# =============================================================================
# wxWidgets Base (pre-built for WASM)
# =============================================================================
set(WXWIDGETS_SOURCE "${CMAKE_SOURCE_DIR}/../wxwidgets" CACHE PATH "Path to wxWidgets source")
set(WXWIDGETS_BUILD "${CMAKE_SOURCE_DIR}/../build-wasm/wxwidgets" CACHE PATH "Path to wxWidgets WASM build")

# Verify wxWidgets build exists
if(NOT EXISTS "${WXWIDGETS_BUILD}/lib/libwx_baseu-3.2-Emscripten.a")
    message(FATAL_ERROR "wxBase WASM build not found. Run scripts/build-wxbase-wasm.sh first")
endif()

# Create imported wxBase library
add_library(wxbase STATIC IMPORTED)
set_target_properties(wxbase PROPERTIES
    IMPORTED_LOCATION "${WXWIDGETS_BUILD}/lib/libwx_baseu-3.2-Emscripten.a"
)

# Create imported wxRegex library (for wxRegEx support)
add_library(wxregex STATIC IMPORTED)
set_target_properties(wxregex PROPERTIES
    IMPORTED_LOCATION "${WXWIDGETS_BUILD}/lib/libwxregexu-3.2.a"
)

# wxWidgets include directories
set(WX_INCLUDE_DIRS
    "${WXWIDGETS_BUILD}/lib/wx/include/base-unicode-static-3.2"  # Platform setup.h
    "${WXWIDGETS_SOURCE}/include"                                  # Main wx headers
)

message(STATUS "Using wxWidgets source at: ${WXWIDGETS_SOURCE}")
message(STATUS "Using wxWidgets build at: ${WXWIDGETS_BUILD}")

# =============================================================================
# Options
# =============================================================================
option(KICAD_CORE_VERBOSE "Enable verbose logging in core library" OFF)

# =============================================================================
# Thirdparty include directories
# =============================================================================
set(THIRDPARTY_INCLUDE_DIRS
    "${KICAD_SOURCE}/thirdparty/fmt/include"
    "${KICAD_SOURCE}/thirdparty/nlohmann_json"
    "${KICAD_SOURCE}/thirdparty/magic_enum/magic_enum"   # magic_enum.hpp is here
    "${KICAD_SOURCE}/thirdparty/dynamic_bitset"
    "${KICAD_SOURCE}/thirdparty/pybind11/include"
)

# =============================================================================
# Clipper2 library (for polygon boolean operations)
# =============================================================================
set(CLIPPER2_DIR "${KICAD_SOURCE}/thirdparty/clipper2")

add_library(clipper2 STATIC
    ${CLIPPER2_DIR}/Clipper2Lib/src/clipper.engine.cpp
    ${CLIPPER2_DIR}/Clipper2Lib/src/clipper.offset.cpp
    ${CLIPPER2_DIR}/Clipper2Lib/src/clipper.rectclip.cpp
)

target_include_directories(clipper2 PUBLIC
    ${CLIPPER2_DIR}/Clipper2Lib/include
)

target_compile_definitions(clipper2 PUBLIC USINGZ)

# =============================================================================
# RTree library (header-only spatial index)
# =============================================================================
add_library(rtree INTERFACE)
target_include_directories(rtree INTERFACE
    ${KICAD_SOURCE}/thirdparty/rtree
)

# =============================================================================
# Core utilities library (with wxBase support)
# =============================================================================
add_library(kicad_core_utils STATIC
    ${KICAD_SOURCE}/libs/core/base64.cpp
    ${KICAD_SOURCE}/libs/core/observable.cpp
    ${KICAD_SOURCE}/libs/core/profile.cpp
    ${KICAD_SOURCE}/libs/core/utf8.cpp
    ${KICAD_SOURCE}/libs/core/wx_stl_compat.cpp
)

target_include_directories(kicad_core_utils PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/wasm-config    # config.h for WASM build
    ${WX_INCLUDE_DIRS}
    ${KICAD_SOURCE}/libs/core/include
)

target_link_libraries(kicad_core_utils PUBLIC wxbase wxregex)

# =============================================================================
# S-expression library (parser for .kicad_pcb files)
# =============================================================================
add_library(sexpr STATIC
    ${KICAD_SOURCE}/libs/sexpr/sexpr.cpp
    ${KICAD_SOURCE}/libs/sexpr/sexpr_parser.cpp
)

target_include_directories(sexpr PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/wasm-config    # config.h for WASM build
    ${WX_INCLUDE_DIRS}
    ${KICAD_SOURCE}/libs/sexpr/include
    ${KICAD_SOURCE}/libs/core/include
    ${KICAD_SOURCE}/include                    # string_utils.h, etc.
)

target_link_libraries(sexpr PUBLIC kicad_core_utils)

# =============================================================================
# KiMath library (geometry and math)
# =============================================================================
set(KIMATH_SRCS
    ${KICAD_SOURCE}/libs/kimath/src/bezier_curves.cpp
    ${KICAD_SOURCE}/libs/kimath/src/convert_basic_shapes_to_polygon.cpp
    ${KICAD_SOURCE}/libs/kimath/src/md5_hash.cpp
    ${KICAD_SOURCE}/libs/kimath/src/transform.cpp
    ${KICAD_SOURCE}/libs/kimath/src/trigo.cpp

    ${KICAD_SOURCE}/libs/kimath/src/geometry/corner_operations.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/distribute.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/eda_angle.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/ellipse.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/circle.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/convex_hull.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/direction_45.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/geometry_utils.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/half_line.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/intersection.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/line.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/nearest.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/oval.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/roundrect.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/seg.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_arc.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_collisions.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_compound.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_file_io.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_line_chain.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_nearest_points.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_poly_set.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_rect.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_segment.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/vector_utils.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/shape_utils.cpp
    ${KICAD_SOURCE}/libs/kimath/src/geometry/vertex_set.cpp

    ${KICAD_SOURCE}/libs/kimath/src/math/vector2.cpp
    ${KICAD_SOURCE}/libs/kimath/src/math/util.cpp
)

add_library(kimath STATIC ${KIMATH_SRCS})

target_include_directories(kimath PUBLIC
    ${WX_INCLUDE_DIRS}
    ${KICAD_SOURCE}/libs/kimath/include
    ${KICAD_SOURCE}/libs/core/include
    ${KICAD_SOURCE}/include                # Main KiCad includes (units, etc.)
)

target_link_libraries(kimath PUBLIC
    kicad_core_utils
    clipper2
    rtree
)

# Define KICAD_CORE_ONLY to enable any conditional compilation
target_compile_definitions(kimath PRIVATE
    KICAD_CORE_ONLY=1
)

if(KICAD_CORE_VERBOSE)
    target_compile_definitions(kimath PRIVATE KICAD_CORE_VERBOSE=1)
endif()

# =============================================================================
# Board data model library
# =============================================================================

# Common infrastructure sources
set(COMMON_SRCS
    ${KICAD_SOURCE}/common/eda_item.cpp
    ${KICAD_SOURCE}/common/eda_shape.cpp
    ${KICAD_SOURCE}/common/eda_text.cpp
    ${KICAD_SOURCE}/common/lset.cpp
    ${KICAD_SOURCE}/common/layer_id.cpp
    ${KICAD_SOURCE}/common/title_block.cpp
    ${KICAD_SOURCE}/common/page_info.cpp
    ${KICAD_SOURCE}/common/common.cpp
    ${KICAD_SOURCE}/common/eda_units.cpp
    ${KICAD_SOURCE}/common/kiid.cpp
    ${KICAD_SOURCE}/common/marker_base.cpp
)

# PCB board model sources
set(BOARD_MODEL_SRCS
    ${KICAD_SOURCE}/pcbnew/board.cpp
    ${KICAD_SOURCE}/pcbnew/board_item.cpp
    ${KICAD_SOURCE}/pcbnew/board_connected_item.cpp
    ${KICAD_SOURCE}/pcbnew/footprint.cpp
    ${KICAD_SOURCE}/pcbnew/pad.cpp
    ${KICAD_SOURCE}/pcbnew/pcb_track.cpp
    ${KICAD_SOURCE}/pcbnew/zone.cpp
    ${KICAD_SOURCE}/pcbnew/pcb_shape.cpp
    ${KICAD_SOURCE}/pcbnew/pcb_text.cpp
    ${KICAD_SOURCE}/pcbnew/pcb_field.cpp
    ${KICAD_SOURCE}/pcbnew/pcb_group.cpp
    ${KICAD_SOURCE}/pcbnew/netinfo_item.cpp
    ${KICAD_SOURCE}/pcbnew/netinfo_list.cpp
    ${KICAD_SOURCE}/pcbnew/padstack.cpp
    ${KICAD_SOURCE}/pcbnew/zone_settings.cpp
    ${KICAD_SOURCE}/pcbnew/board_design_settings.cpp
)

add_library(board_model STATIC
    ${COMMON_SRCS}
    ${BOARD_MODEL_SRCS}
)

target_include_directories(board_model PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/wasm-config
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
    ${WX_INCLUDE_DIRS}
    ${THIRDPARTY_INCLUDE_DIRS}
    ${KICAD_SOURCE}/include
    ${KICAD_SOURCE}/pcbnew
    ${KICAD_SOURCE}/libs/kimath/include
    ${KICAD_SOURCE}/libs/core/include
)

target_link_libraries(board_model PUBLIC
    kimath
    sexpr
    kicad_core_utils
)

target_compile_definitions(board_model PRIVATE
    KICAD_CORE_ONLY=1
    PCBNEW=1
)

# =============================================================================
# Combined kicad_core library
# =============================================================================
add_library(kicad_core INTERFACE)
target_link_libraries(kicad_core INTERFACE
    board_model
    kimath
    sexpr
    kicad_core_utils
    clipper2
    rtree
)

# =============================================================================
# Test executable (optional)
# =============================================================================
option(BUILD_TESTS "Build test executables" ON)

if(BUILD_TESTS)
    add_executable(test_kimath
        ${CMAKE_CURRENT_SOURCE_DIR}/src/test_kimath.cpp
    )
    target_link_libraries(test_kimath PRIVATE kimath sexpr)
endif()

# =============================================================================
# Summary
# =============================================================================
message(STATUS "")
message(STATUS "kicad_core configuration:")
message(STATUS "  KiCad source: ${KICAD_SOURCE}")
message(STATUS "  Verbose logging: ${KICAD_CORE_VERBOSE}")
message(STATUS "  Build tests: ${BUILD_TESTS}")
message(STATUS "")
