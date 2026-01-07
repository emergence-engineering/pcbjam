// Minimal config.h for native GAL test
// Based on KiCad's generated config
#ifndef KICAD_CONFIG_H
#define KICAD_CONFIG_H

// Version info
#define KICAD_MAJOR_VERSION 8
#define KICAD_MINOR_VERSION 0
#define KICAD_PATCH_VERSION 0

// Enable OpenGL
#define KICAD_USE_OCC 0
#define KICAD_USE_EGL 0

// Platform detection
#ifdef __APPLE__
#define KICAD_MACOS 1
#endif

// Math
#define KICAD_USE_STDROUND 1

// Ensure types are properly sized
#include <cstdint>

#endif // KICAD_CONFIG_H
