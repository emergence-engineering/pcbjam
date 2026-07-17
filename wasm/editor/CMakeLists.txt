# Merged pcbnew+eeschema WASM editor (editor-unification Part 2).
#
# ONE executable links THREE kifaces (pcbnew, eeschema, cvpcb); the editor frame
# (PCB / Footprint / Schematic / Symbol) is chosen at runtime by single_top.cpp's
# --frame flag, while cvpcb only opens in-session via eeschema's Assign Footprints
# (KIWAY::Player( FRAME_CVPCB )). Added from the kicad fork's top-level CMakeLists.txt
# via add_subdirectory( ${KICAD_WASM_LAYER}/editor ) when EMSCRIPTEN AND
# KICAD_WASM_MERGED_EDITOR — after eeschema/, pcbnew/ and cvpcb/, so the kifaces'
# CACHE INTERNAL library lists exist here.
#
# Collision handling (see KICAD_WASM_PCB_SIDE_RENAMES in the fork's top-level
# CMakeLists.txt and docs/features/editor-unification/): the PCB-side targets compile
# with per-engine symbol renames; each kiface gets its own KIFACE_GETTER name; the
# plain Kiface() the shared common/ code falls back to is defined here
# (merged_kiface_dispatch.cpp).
#
# The standalone pcbnew/eeschema targets still exist in this (option-ON) tree but are
# not intended to be built here: their kiface objects carry the merged renames, and
# their single_top TUs still bind the un-renamed KIFACE_GETTER — build them from their
# own (option-OFF) per-app trees as before.

include_directories( BEFORE ${INC_BEFORE} )
include_directories(
    ${CMAKE_SOURCE_DIR}/common
    ${CMAKE_SOURCE_DIR}/common/dialogs
    ${INC_AFTER}
    )

add_executable( kicad_editor
    ${CMAKE_SOURCE_DIR}/common/single_top.cpp
    merged_kiface_dispatch.cpp
    )

# TOP_FRAME is only the DEFAULT frame (no --frame given). No PGM_DATA_FILE_EXT: the
# runtime extension map in single_top.cpp covers all four frames. No BUILD_KIWAY_DLL:
# static kiface linking (matches the per-app WASM executables). KICAD_MERGED_KIFACES
# selects single_top.cpp's dual-getter registration branch.
set_source_files_properties( ${CMAKE_SOURCE_DIR}/common/single_top.cpp PROPERTIES
    COMPILE_DEFINITIONS "TOP_FRAME=FRAME_PCB_EDITOR;KICAD_MERGED_KIFACES"
    )

# All three kifaces' full library sets (exported CACHE INTERNAL by pcbnew/, eeschema/
# and cvpcb/). The overlap (common, kicommon, gal, ...) is deduped; generator-expression
# entries (native-only pads_common/pcm) are inert strings that evaluate to nothing here.
set( KICAD_EDITOR_LIBS ${PCBNEW_KIFACE_LIBRARIES} ${EESCHEMA_KIFACE_LIBRARIES} ${CVPCB_KIFACE_LIBRARIES} )
list( REMOVE_DUPLICATES KICAD_EDITOR_LIBS )

target_link_libraries( kicad_editor PRIVATE ${KICAD_EDITOR_LIBS} )

# Same link shape as the standalone pcbnew WASM executable: allow-multiple-definition
# for the wx/KiCad dupes, and --whole-archive pcbcommon so RTTI-only-referenced
# vtables/typeinfo are pulled in.
target_link_options( kicad_editor PRIVATE
    "LINKER:--allow-multiple-definition"
    "LINKER:--whole-archive"
    "$<TARGET_FILE:pcbcommon>"
    "LINKER:--no-whole-archive"
    $<$<BOOL:${KICAD_MAKE_LINK_MAPS}>:-Wl,--cref,-Map=kicad_editor.map>
    )
