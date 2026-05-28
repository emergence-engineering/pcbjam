/*
 * Embind bindings for KiCad PCB Calculator WASM.
 *
 * Currently empty — reserved for future calculator-specific JS bindings
 * (e.g., exposing transmission-line calculators or attenuator math to
 * Pyodide / browser callers). Kept as a separate translation unit so the
 * calculator build pipeline mirrors pcbnew's pcbnew_embind.cpp structure.
 */

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(pcb_calculator) {
    // Reserved for future calculator-specific JS bindings.
}
#endif
