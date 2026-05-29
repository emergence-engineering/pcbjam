/*
 * Eeschema frame stubs for KiCad WASM build.
 *
 * Mirror of pcb_frame_stub.cpp. Populate as linker errors surface during the
 * first eeschema-wasm build. Methods that need to be stubbed are typically:
 *   - Scripting helpers (LoadSchematic / SaveSchematic) when KICAD_SCRIPTING=OFF
 *   - Action-plugin glue (no plugins in WASM)
 *   - Filesystem-watcher hooks when wxUSE_FSWATCHER=0
 *
 * Leave this file empty until the linker complains; the build script skips
 * compiling it when it has zero bytes.
 */

#ifdef __EMSCRIPTEN__
#endif
