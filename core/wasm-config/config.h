/*
 * config.h - Minimal config for kicad-core standalone build
 *
 * This replaces the auto-generated config.h from KiCad's CMake
 */

#ifndef KICAD_CORE_CONFIG_H
#define KICAD_CORE_CONFIG_H

// Platform detection for timing functions
#if defined(_WIN32)
    // Windows uses GetSystemTimeAsFileTime
#elif defined(__EMSCRIPTEN__) || defined(__APPLE__) || defined(__linux__) || defined(__unix__)
    #define HAVE_CLOCK_GETTIME 1
#else
    #define HAVE_GETTIMEOFDAY_FUNC 1
#endif

// Version info
#define KICAD_MAJOR_VERSION 8
#define KICAD_MINOR_VERSION 0
#define KICAD_PATCH_VERSION 0
#define KICAD_VERSION_FULL "8.0.0-wasm"

// Feature flags - all disabled for core-only build
#define KICAD_USE_CURL 0
#define KICAD_USE_GIT 0
#define KICAD_USE_OCC 0
#define KICAD_USE_NGSPICE 0

#endif // KICAD_CORE_CONFIG_H
