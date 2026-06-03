/*
 * 3Dconnexion SpaceMouse plugin stubs for KiCad gerbview WASM build.
 * The 3DxWare driver is unavailable in the browser; these stubs satisfy the
 * symbols referenced from gerbview_frame.cpp without doing anything.
 */

// Minimal definition for NL_GERBVIEW_PLUGIN_IMPL — required because the
// unique_ptr<NL_GERBVIEW_PLUGIN_IMPL> destructor needs a complete type.
class NL_GERBVIEW_PLUGIN_IMPL {};

#include <navlib/nl_gerbview_plugin.h>

NL_GERBVIEW_PLUGIN::NL_GERBVIEW_PLUGIN()
{
}

NL_GERBVIEW_PLUGIN::~NL_GERBVIEW_PLUGIN()
{
}

void NL_GERBVIEW_PLUGIN::SetCanvas( EDA_DRAW_PANEL_GAL* aViewport )
{
    (void) aViewport;
}

void NL_GERBVIEW_PLUGIN::SetFocus( bool aFocus )
{
    (void) aFocus;
}
