/*
 * kicad_tools — merged headless KiCad CLI, built as ONE WebAssembly module
 * linking both dieted kifaces (pcbjam-mcp 0001 tier 3a).
 *
 * Thin dispatcher over the two per-app entry points (compiled into this image
 * with KICAD_TOOLS_COMBINED, which strips their standalone main()s):
 *
 *   pcbnew side   (pcb_convert_main.cpp):
 *     kicad_tools --drc [--json] [--strict] <file.kicad_pcb> [<out>]
 *
 *   eeschema side (sym_convert_main.cpp) — everything else:
 *     kicad_tools --convert-lib <input.lib> <output.kicad_sym>
 *     kicad_tools --lint [--strict] <file> [<file>...]
 *                       (.kicad_pcb files get a FULL parse here — the pcbnew
 *                       parser is linked; the lint driver calls back into
 *                       pcbToolsLintBoard on the pcb side)
 *     kicad_tools --erc [--json] [--strict] <file.kicad_sch> [<out>]
 *     kicad_tools --netlist [--xml] <file.kicad_sch> [<out>]
 *     kicad_tools --bom <file.kicad_sch> [<out>]
 *     kicad_tools --plot [--pdf] <file.kicad_sch> [<out>]
 *
 * Each side brings up its own minimal PGM runtime on first use; dispatch is
 * exclusive per process, so the two runtimes never coexist.
 */

#include <cstdio>
#include <cstring>
#include <unistd.h>

int symConvertMain( int argc, char** argv );
int pcbConvertMain( int argc, char** argv );


int main( int argc, char** argv )
{
    int rc;

    if( argc >= 2 && std::strcmp( argv[1], "--drc" ) == 0 )
        rc = pcbConvertMain( argc, argv );
    else
        rc = symConvertMain( argc, argv );

    // Skip the EXIT_RUNTIME static-dtor pass (same rationale as
    // pcb_convert_main.cpp, which already does this on its --drc path): with
    // the pcbnew kiface in the image, some dieted-out teardown is reachable
    // through vtable slots from static dtors and traps ("table index is out
    // of bounds") AFTER the subcommand finished, clobbering the exit code.
    std::fflush( nullptr );
    _exit( rc );
}
