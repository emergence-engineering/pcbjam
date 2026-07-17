#!/bin/bash
# Duplicate-symbol audit for the merged kicad_editor image (editor-unification Part 2).
#
# The pcbnew and eeschema kifaces are statically linked into one WASM image with
# --allow-multiple-definition (required for wx/KiCad dupes), so a symbol both engines
# define binds SILENTLY to the first definition — a wrong-behavior/memory-corruption
# bug, never a link error. This script intersects the two kifaces' defined symbols so
# every collision is a conscious decision (the known set is renamed per-engine via
# KICAD_WASM_PCB_SIDE_RENAMES in kicad/CMakeLists.txt).
#
# Run INSIDE the build container (needs $EMSDK llvm-nm and the per-app build trees):
#   docker compose -f docker/docker-compose.yml exec kicad-wasm-builder \
#       /workspace/scripts/kicad/audit-merged-symbols.sh
# Re-run whenever the kicad submodule is bumped. Expected output: EMPTY intersection
# (all known collisions renamed). Any line of output is a new upstream collision to
# add to the rename list.
#
# Method (see docs/features/editor-unification/06-part2-implementation.md):
#  - strong (T/D/B/R) defined external symbols: direct first-def-wins collisions.
#  - weak (W/V) symbols are only dangerous when the SAME name has DIFFERENT
#    definitions per module (same-named classes with inline members). Weak symbols
#    also defined by the shared libs are one shared definition — filtered out. The
#    remainder is mostly benign template dedup (magic_enum etc.); review NEW entries.

set -euo pipefail

BUILD_ROOT="${BUILD_ROOT:-/workspace/build-wasm}"
P="${BUILD_ROOT}/kicad-pcbnew"
E="${BUILD_ROOT}/kicad-eeschema"
NM="${EMSDK:?EMSDK not set}/upstream/bin/llvm-nm"
OUT="${TMPDIR:-/tmp}/merged-symbol-audit"
mkdir -p "${OUT}"

SKIP_STANDALONE=
if [ ! -d "${P}/pcbnew" ] || [ ! -d "${E}/eeschema" ]; then
    echo "== pcb/sch standalone audit SKIPPED: need built kicad-pcbnew and kicad-eeschema" >&2
    echo "   trees under ${BUILD_ROOT} (./docker/build.sh pcbnew,eeschema --compile-only)" >&2
    SKIP_STANDALONE=1
fi

if [ -z "${SKIP_STANDALONE}" ]; then

pcb_files() {
    find "${P}/pcbnew/CMakeFiles/pcbnew_kiface_objects.dir" -name '*.o'
    ls "${P}/common/libpcbcommon.a" \
       "${P}/pcbnew/connectivity/libconnectivity.a" \
       "${P}/pcbnew/router/libpnsrouter.a" \
       "${P}/pcbnew/navlib/libpcbnew_navlib.a" \
       "${P}/utils/idftools/libidf3.a" \
       "${P}"/pcbnew/pcb_io/*/*.a 2>/dev/null || true
    find "${P}/3d-viewer" -name '*.o' 2>/dev/null || true
}

sch_files() {
    find "${E}/eeschema/CMakeFiles/eeschema_kiface_objects.dir" -name '*.o'
    ls "${E}/eeschema/navlib/libeeschema_navlib.a" 2>/dev/null || true
}

# Weak symbols defined by the SHARED libs (one definition linked once — safe dedup).
shared_syms() {
    ${NM} --defined-only --extern-only --format=posix \
        "${P}/common/libcommon.a" "${P}/common/libkicommon.a" \
        "${P}/common/gal/libkigal.a" "${P}/libs/core/libcore.a" \
        "${P}/libs/kimath/libkimath.a" "${P}/libs/kiplatform/libkiplatform.a" \
        "${P}/scripting/libscripting.a" "${P}/api/libkiapi.a" \
        "${P}/libs/sexpr/libsexpr.a" 2>/dev/null | awk '{print $1}' | sort -u
}

echo "== collecting symbols (llvm-nm)..." >&2
${NM} --defined-only --extern-only --format=posix $(pcb_files) 2>/dev/null \
    | awk '$2 ~ /^[TDBR]$/ {print $1}' | sort -u > "${OUT}/pcb_strong.txt"
${NM} --defined-only --extern-only --format=posix $(sch_files) 2>/dev/null \
    | awk '$2 ~ /^[TDBR]$/ {print $1}' | sort -u > "${OUT}/sch_strong.txt"
${NM} --defined-only --extern-only --format=posix $(pcb_files) 2>/dev/null \
    | awk '$2 ~ /^[WVwv]$/ {print $1}' | sort -u > "${OUT}/pcb_weak.txt"
${NM} --defined-only --extern-only --format=posix $(sch_files) 2>/dev/null \
    | awk '$2 ~ /^[WVwv]$/ {print $1}' | sort -u > "${OUT}/sch_weak.txt"
shared_syms > "${OUT}/shared.txt"

# Known-renamed / expected entries. In OPTION-OFF per-app trees (the normal state of
# kicad-pcbnew / kicad-eeschema) the renames are NOT applied, so the known set shows
# up here — filter it; the merged tree compiles with the renames so these cannot
# collide there. KIFACE_1/Kiface get per-engine getter/accessor names; the class/data
# names are prefixed PCB_/pcb (KICAD_WASM_PCB_SIDE_RENAMES).
KNOWN='^(KIFACE_1$|_Z6Kifacev$|_Z16checkOverwriteDb|pcbAllowedActions$|allowedActions$|g_excludedLayers$|_Z[A-Z0-9]*[0-9]+(PCB_)?(DIALOG_TEXT_PROPERTIES|DIALOG_SHAPE_PROPERTIES|DIALOG_TABLE_PROPERTIES|DIALOG_TABLECELL_PROPERTIES|DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS|PANEL_SETUP_FORMATTING|TEXT_SEARCH_HANDLER|GROUP_SEARCH_HANDLER|TEXTBOX_POINT_EDIT_BEHAVIOR|RECTANGLE_POINT_EDIT_BEHAVIOR|FILEDLG_HOOK_SAVE_PROJECT|FOOTPRINT_INFO_GENERATOR))'
# Mangled-name filter needs the raw class tokens too (ZTV/ZTI/ZTS/ZN prefixes).
CLASSES='DIALOG_TEXT_PROPERTIES|DIALOG_SHAPE_PROPERTIES|DIALOG_TABLE_PROPERTIES|DIALOG_TABLECELL_PROPERTIES|DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS|PANEL_SETUP_FORMATTING|TEXT_SEARCH_HANDLER|GROUP_SEARCH_HANDLER|TEXTBOX_POINT_EDIT_BEHAVIOR|RECTANGLE_POINT_EDIT_BEHAVIOR|FILEDLG_HOOK_SAVE_PROJECT|FOOTPRINT_INFO_GENERATOR|checkOverwriteDb|allowedActions|g_excludedLayers'

echo "== STRONG duplicates (unexpected — must be renamed or justified):"
comm -12 "${OUT}/pcb_strong.txt" "${OUT}/sch_strong.txt" \
    | grep -vE "${CLASSES}" | grep -vE '^KIFACE_1$|^_Z6Kifacev$' || true

echo "== WEAK duplicates not from shared libs, mentioning NEW class tokens"
echo "   (known colliding classes filtered; review anything printed):"
comm -12 "${OUT}/pcb_weak.txt" "${OUT}/sch_weak.txt" \
    | comm -23 - "${OUT}/shared.txt" \
    | grep -vE "${CLASSES}" \
    | grep -E '_Z(TV|TI|TS|N)[0-9]+[A-Z]' \
    | grep -vE 'magic_enum|wxEventFunctorMethod|wxNavigationEnabled|wxSimplebook|wxDataView|wxMenuBar|wxVector|KIFACE|COLLECTOR|RC_JSON|PARAM_SCALED|EDA_|BOX2|WX_MENUBAR|SEARCH_HANDLER' || true

fi # SKIP_STANDALONE

# -------------------------------------------------------------------------
# cvpcb third-kiface audit (feature/cvpcb-wasm). Unlike pcbnew/eeschema above
# (audited from their option-OFF per-app trees), cvpcb_kiface_objects only
# exists in the merged kicad-kicad_editor tree — where the renames ARE applied,
# so these intersections audit exactly what links into the image. Expected
# output: EMPTY strong intersections against both engines.
M="${BUILD_ROOT}/kicad-kicad_editor"

if [ -d "${M}/cvpcb/CMakeFiles/cvpcb_kiface_objects.dir" ]; then
    echo "== collecting cvpcb symbols from merged tree (llvm-nm)..." >&2

    cv_files()  { find "${M}/cvpcb/CMakeFiles/cvpcb_kiface_objects.dir" -name '*.o'; }
    mpcb_files() {
        find "${M}/pcbnew/CMakeFiles/pcbnew_kiface_objects.dir" -name '*.o'
        ls "${M}/common/libpcbcommon.a" \
           "${M}/pcbnew/connectivity/libconnectivity.a" \
           "${M}/pcbnew/router/libpnsrouter.a" \
           "${M}/pcbnew/navlib/libpcbnew_navlib.a" \
           "${M}/utils/idftools/libidf3.a" \
           "${M}"/pcbnew/pcb_io/*/*.a 2>/dev/null || true
        find "${M}/3d-viewer" -name '*.o' 2>/dev/null || true
    }
    msch_files() {
        find "${M}/eeschema/CMakeFiles/eeschema_kiface_objects.dir" -name '*.o'
        ls "${M}/eeschema/navlib/libeeschema_navlib.a" 2>/dev/null || true
    }

    ${NM} --defined-only --extern-only --format=posix $(cv_files) 2>/dev/null \
        | awk '$2 ~ /^[TDBR]$/ {print $1}' | sort -u > "${OUT}/cv_strong.txt"
    ${NM} --defined-only --extern-only --format=posix $(cv_files) 2>/dev/null \
        | awk '$2 ~ /^[WVwv]$/ {print $1}' | sort -u > "${OUT}/cv_weak.txt"
    ${NM} --defined-only --extern-only --format=posix $(mpcb_files) 2>/dev/null \
        | awk '$2 ~ /^[TDBR]$/ {print $1}' | sort -u > "${OUT}/mpcb_strong.txt"
    ${NM} --defined-only --extern-only --format=posix $(mpcb_files) 2>/dev/null \
        | awk '$2 ~ /^[WVwv]$/ {print $1}' | sort -u > "${OUT}/mpcb_weak.txt"
    ${NM} --defined-only --extern-only --format=posix $(msch_files) 2>/dev/null \
        | awk '$2 ~ /^[TDBR]$/ {print $1}' | sort -u > "${OUT}/msch_strong.txt"
    ${NM} --defined-only --extern-only --format=posix $(msch_files) 2>/dev/null \
        | awk '$2 ~ /^[WVwv]$/ {print $1}' | sort -u > "${OUT}/msch_weak.txt"

    # Shared-lib symbols from the MERGED tree (one definition linked once — safe
    # dedup), independent of the standalone trees' shared.txt above.
    ${NM} --defined-only --extern-only --format=posix \
        "${M}/common/libcommon.a" "${M}/common/libkicommon.a" \
        "${M}/common/gal/libkigal.a" "${M}/libs/core/libcore.a" \
        "${M}/libs/kimath/libkimath.a" "${M}/libs/kiplatform/libkiplatform.a" \
        "${M}/scripting/libscripting.a" "${M}/api/libkiapi.a" \
        "${M}/libs/sexpr/libsexpr.a" 2>/dev/null \
        | awk '{print $1}' | sort -u > "${OUT}/shared_merged.txt"

    echo "== cvpcb vs pcbnew STRONG duplicates (merged tree — must be empty):"
    comm -12 "${OUT}/cv_strong.txt" "${OUT}/mpcb_strong.txt" || true

    echo "== cvpcb vs eeschema STRONG duplicates (merged tree — must be empty):"
    comm -12 "${OUT}/cv_strong.txt" "${OUT}/msch_strong.txt" || true

    echo "== cvpcb WEAK duplicates not from shared libs, mentioning class tokens"
    echo "   (review anything printed — same criteria as the pcb/sch weak audit."
    echo "    Reviewed 2026-07-17 as identical-definition dedups, now filtered:"
    echo "    PCB_BASE_FRAME/PCB_VIEWER_TOOLS/PCB_EDITOR_CONDITIONS/NETLIST inline"
    echo "    members — cvpcb compiles pcbnew's headers with the same renames; plus"
    echo "    common-lib ACTIONS/COMMON_CONTROL/GetAppSettings<CVPCB_SETTINGS>.):"
    cat "${OUT}/mpcb_weak.txt" "${OUT}/msch_weak.txt" | sort -u > "${OUT}/engines_weak.txt"
    comm -12 "${OUT}/cv_weak.txt" "${OUT}/engines_weak.txt" \
        | comm -23 - "${OUT}/shared_merged.txt" \
        | grep -E '_Z(TV|TI|TS|N)[0-9]+[A-Z]' \
        | grep -vE 'magic_enum|wxEventFunctorMethod|wxNavigationEnabled|wxSimplebook|wxDataView|wxMenuBar|wxVector|KIFACE|COLLECTOR|RC_JSON|PARAM_SCALED|EDA_|BOX2|WX_MENUBAR|SEARCH_HANDLER|FOOTPRINT_|LISTBOX|PCB_BASE_FRAME|PCB_VIEWER_TOOLS|PCB_EDITOR_CONDITIONS|COMMON_CONTROL|CVPCB_SETTINGS|7ACTIONS|7NETLIST' || true
else
    echo "== cvpcb audit SKIPPED (no merged kicad-kicad_editor tree with cvpcb_kiface_objects under ${BUILD_ROOT})" >&2
fi

echo "== audit done (details in ${OUT})"
