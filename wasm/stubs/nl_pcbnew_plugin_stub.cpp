/*
 * SpaceNavigator plugin stubs for KiCad WASM build
 * 3D mouse support is not available in WASM
 */

// Minimal definition for NL_PCBNEW_PLUGIN_IMPL
// Required because unique_ptr destructor needs a complete type
class NL_PCBNEW_PLUGIN_IMPL {};

#include <navlib/nl_pcbnew_plugin.h>

// NL_PCBNEW_PLUGIN stub implementation
NL_PCBNEW_PLUGIN::NL_PCBNEW_PLUGIN( PCB_DRAW_PANEL_GAL* aViewport )
{
    (void)aViewport;
    // No implementation - 3D mouse not available in WASM
}

NL_PCBNEW_PLUGIN::~NL_PCBNEW_PLUGIN()
{
}

void NL_PCBNEW_PLUGIN::SetFocus( bool aFocus )
{
    (void)aFocus;
}
