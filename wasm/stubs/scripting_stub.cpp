/*
 * Scripting stubs for KiCad WASM build
 * Python scripting is not available in WASM
 *
 * These stubs provide implementations for methods declared in pcb_scripting_tool.h
 * that are called from panel_pcbnew_action_plugins.cpp
 */

#include <python/scripting/pcb_scripting_tool.h>

// Constructor/Destructor implementations
SCRIPTING_TOOL::SCRIPTING_TOOL() :
    PCB_TOOL_BASE( "pcbnew.ScriptingTool" )
{
}

SCRIPTING_TOOL::~SCRIPTING_TOOL()
{
}

// Virtual method implementations
bool SCRIPTING_TOOL::Init()
{
    return true;
}

void SCRIPTING_TOOL::Reset( RESET_REASON aReason )
{
    (void)aReason;
}

// Static method implementations - these are called from panel_pcbnew_action_plugins.cpp
void SCRIPTING_TOOL::ReloadPlugins()
{
    // No-op: Python plugins not available in WASM
}

void SCRIPTING_TOOL::ShowPluginFolder()
{
    // No-op: Plugin folder not accessible in WASM
}

// Private method implementations
int SCRIPTING_TOOL::reloadPlugins( const TOOL_EVENT& aEvent )
{
    (void)aEvent;
    return 0;
}

int SCRIPTING_TOOL::showPluginFolder( const TOOL_EVENT& aEvent )
{
    (void)aEvent;
    return 0;
}

void SCRIPTING_TOOL::setTransitions()
{
    // No transitions: scripting not available
}

// Private static method - must be provided since it's declared in header
void SCRIPTING_TOOL::callLoadPlugins()
{
    // No-op: Python not available in WASM
}
