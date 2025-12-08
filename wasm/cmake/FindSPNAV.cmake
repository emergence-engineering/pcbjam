# FindSPNAV.cmake for WASM cross-compilation
# SPNAV (SpaceNavigator 3D mouse) is not supported in browser
# This stub marks it as not found

set(SPNAV_FOUND FALSE)
set(SPNAV_INCLUDE_DIR "")
set(SPNAV_LIBRARY "")

# Mark as not found but don't error - KiCad handles missing SPNAV gracefully
message(STATUS "SPNAV not available for WASM build (3D mouse not supported in browser)")
